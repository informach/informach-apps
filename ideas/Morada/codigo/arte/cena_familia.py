"""Cena de exemplo da biblioteca: uma família reunida para a foto (doze pessoas e o labrador), montada só com o que a
biblioteca tem: os corpos do arquivo-mestre, as roupas e cabelos dos catálogos (com cor livre), as expressões, as poses
da biblioteca de animações (com ajustes de braço por IK: mão no ombro, criança no colo, mão no cachorro) e um bicho.

Uso: python cena_familia.py -- <corpos.blend> <saida.png> [saida.blend] [--rapido]
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector, Quaternion

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import roupas as R  # noqa: E402
import cabelos as CAB  # noqa: E402

PACOTES = os.path.join(AQUI, "ideias")
BIB = os.path.join(AQUI, "biblioteca", "corrigido_todos")
BICHOS = os.path.join(AQUI, "pets", "bichos.blend")
FONTE = {"adulta": "adulto", "idosa": "idoso", "adolescente_f": "adolescente_m", "crianca_f": "crianca_m",
         "pequena_f": "pequeno_m"}
TONS = {"clara": "#FFB69F", "media": "#FEA679", "morena": "#BA6953", "escura": "#482B25"}

# ------------------------------------------------------------------ quem está na foto
# x (esquerda → direita da câmera), y (para trás), giro (graus, + vira para a esquerda da câmera)
PESSOAS = [
    dict(id="magro", corpo="alto_magro", pose=("resident.idle.neutral", 40), lugar=(-1.62, 0.28, -12),
         cabelo=None, pelos=["bigode_2"], cor_pelos="#6B4A32",
         roupa=[("nov_touca", "#857A6C"), ("nov_regata_justa", "#EEF0F3"), ("nov_bermuda_folgada", "#7A4E35"),
                ("roupa_chinelo_005", None)]),
    dict(id="moca", corpo="adolescente_f", pose=("resident.idle.neutral", 20), lugar=(-1.2, 0.08, -8),
         cabelo=("cabelo_sobrevivente_comprido", "#8A4A2C"),
         roupa=[("nov_camiseta_justa", "#7B4FD6"), ("nov_calca_jeans", "#3D7BD6"), ("roupa_tenis_009", "#9AA0A8")]),
    dict(id="barbudo", corpo="plus_m", pose=("resident.idle.neutral", 30), lugar=(-0.7, 0.3, -5),
         cabelo=("cabelo_seguranca", "#6B4A32"), pelos=["barba_2"],
         roupa=[("nov_polo", "#F29A22"), ("nov_calca_social", "#2B2D33"), ("roupa_sapato_seguranca", "#8A5A3C")]),
    dict(id="rapaz", corpo="adolescente_m", pose=("resident.idle.neutral", 10), lugar=(-0.18, 0.5, 0),
         cabelo=("cabelo_xadrez1_chapeu", "#E8C27A"),
         roupa=[("nov_bone_novo", "#D9433B"), ("nov_agasalho", "#5B7FD6"), ("nov_calca_jeans", "#3A4A6B"),
                ("roupa_tenis_009", None)]),
    dict(id="mae", corpo="adulta", pose=("resident.idle.neutral", 50), lugar=(0.3, 0.28, 4),
         cabelo=("cabelo_criativo12_comprido", "#7A4630"),
         roupa=[("gen_vestido_justo", "#1E9E52"), ("roupa_corrente_plus", None), ("roupa_tenis_009", "#F2EEE8")]),
    dict(id="pai", corpo="adulto", pose=("resident.idle.neutral", 20), lugar=(0.86, 0.3, 8), tom="morena",
         cabelo=("cabelo_seguranca_chapeu", "#2B1D16"), pelos=["barba_2"],
         roupa=[("nov_bone_novo", "#3A3D44"), ("nov_camisa_social", "#D8E2EC"), ("nov_calca_social", "#1E2024"),
                ("roupa_tenis_009", None)]),
    dict(id="menina_colo", corpo="pequena_f", pose=("resident.sit.chair.idle", 30), lugar=(1.12, 0.1, -10), expr="feliz",
         cabelo=("maria_chiquinha", "#5A3424"),
         roupa=[("nov_camiseta_justa", "#F07AA6"), ("nov_calca_moletom", "#F2C231"), ("roupa_tenis_plus", "#F07AA6")]),
    dict(id="avo", corpo="idoso", pose=("resident.idle.neutral", 30), lugar=(1.48, 0.18, 10),
         cabelo=("cabelo", "#E9E9E6"), pelos=["bigode_1"], cor_pelos="#E9E9E6",
         roupa=[("nov_camisa_uniforme", "#8A52D6"), ("nov_calca_social", "#7A5A44"), ("roupa_sapato_seguranca", "#6E737B"),
                ("nov_guia_retratil", "#D9433B")]),
    dict(id="avoa", corpo="idosa", pose=("resident.idle.neutral", 60), lugar=(1.98, 0.32, 14),
         cabelo=("cabelo", "#D9D9D6"),
         roupa=[("nov_moletom", "#1FA59A"), ("nov_cachecol", "#F0509A"), ("nov_calca_jeans", "#2F8FE0"),
                ("roupa_tenis_plus", "#F0509A")]),
    dict(id="menino", corpo="crianca_m", pose=("resident.idle.neutral", 30), lugar=(-0.52, -0.42, -4), expr="feliz",
         cabelo=("cabelo_seguranca_chapeu", "#6B4A32"),
         roupa=[("nov_bone_helice", "#3BAA5C"), ("nov_agasalho_listrado", "#3BAA5C"), ("nov_calca_moletom", "#5A5F66"),
                ("roupa_tenis_009", "#8A52D6")]),
    dict(id="vovo", corpo="plus_f", pose=("resident.romance.propose", 60), lugar=(-0.02, -0.3, 0),
         cabelo=("coque", "#CFCFCC"),
         roupa=[("nov_vestido_gola", "#2FB39A"), ("nov_legging", "#3A3D44"), ("roupa_tenis_009", "#2FB36A")]),
    dict(id="menina", corpo="crianca_f", pose=("resident.sit.chair.idle", 30), lugar=(0.2, -0.45, 0),
         cabelo=("cabelo_caixa", "#8A5A3A"),
         roupa=[("nov_polo", "#5CD6E0"), ("nov_short_curto", "#F2E040"), ("roupa_tenis_009", "#B8C0C8")]),
]


def _rgb(h):
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))


# ------------------------------------------------------------------ materiais
def tinge(ob, item_id, cor_hex):
    """Cor livre: cor × (luminância do pixel ÷ luminância da cor principal), só na parte da máscara (como a página)."""
    info = R.MASCARAS.get(item_id, {})
    if not cor_hex:
        return
    rgb = _rgb(cor_hex)
    for k, m in enumerate(ob.data.materials):
        base_nome = m.name.split(".")[0] if m else None  # o material pode vir como cópia (".001")
        if not m or base_nome not in info:
            continue
        mi = info[base_nome]
        m2 = m.copy()
        ob.data.materials[k] = m2
        nt = m2.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
        if tex is None:
            continue
        msk = nt.nodes.new("ShaderNodeTexImage")
        msk.image = bpy.data.images.load(os.path.join(R.PASTA_MASC, mi["mascara"]), check_existing=True)
        msk.image.colorspace_settings.name = "Non-Color"
        msk.interpolation = tex.interpolation
        uvn = next((l.from_node for l in nt.links if l.to_node == tex and l.to_socket.name == "Vector"), None)
        if uvn is not None:
            nt.links.new(uvn.outputs[0], msk.inputs["Vector"])
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs[0].default_value = 1.0
        k_ = 1.0 / max(mi["lum"], 0.02)
        mul.inputs[7].default_value = (min(rgb[0] * k_, 4), min(rgb[1] * k_, 4), min(rgb[2] * k_, 4), 1)
        nt.links.new(tex.outputs["Color"], mul.inputs[6])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        nt.links.new(msk.outputs["Color"], mix.inputs[0])
        nt.links.new(tex.outputs["Color"], mix.inputs[6])
        nt.links.new(mul.outputs[2], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])


def cor_lisa(ob, cor_hex, rugosidade=0.7):
    """Cabelo, barba e bigode: uma cor só, com o sombreado da luz."""
    m = bpy.data.materials.new(ob.name + "_cor")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*_rgb(cor_hex), 1)
    b.inputs["Roughness"].default_value = rugosidade
    ob.data.materials.clear()
    ob.data.materials.append(m)


def tom_de_pele(ob, tom):
    """Pele mais escura ou mais clara: a textura multiplicada pela razão entre o tom pedido e o tom de origem (clara)."""
    alvo, base = _rgb(TONS[tom]), _rgb(TONS["clara"])
    k = [a / b for a, b in zip(alvo, base)]
    for i, m in enumerate(ob.data.materials):
        if not m:
            continue
        m2 = m.copy()
        ob.data.materials[i] = m2
        nt = m2.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        lk = next((l for l in nt.links if l.to_socket == bsdf.inputs["Base Color"]), None)
        if lk is None:
            continue
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs[0].default_value = 1.0
        mul.inputs[7].default_value = (*k, 1)
        nt.links.new(lk.from_socket, mul.inputs[6])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])


# ------------------------------------------------------------------ poses
def pose_da_biblioteca(arm, corpo, acao, quadro):
    """Põe o esqueleto no quadro de uma animação da biblioteca e congela esse quadro na pose (sem ação ligada)."""
    base = corpo.split("__")[0]  # cópia de um corpo (cena com o mesmo corpo mais de uma vez)
    fonte = FONTE.get(base, base)
    nome = acao
    with bpy.data.libraries.load(os.path.join(BIB, fonte + ".blend"), link=False) as (src, dst):
        dst.actions = [nome] if nome in src.actions else []
    if not dst.actions:
        print("sem ação", fonte, acao)
        return
    act = dst.actions[0]
    act.name = f"{arm.name}|{acao}"
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if act.slots:
        ad.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    bpy.context.scene.frame_set(int(min(max(quadro, f0), f1)))
    bpy.context.view_layer.update()
    mats = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
    ad.action = None
    for pb in arm.pose.bones:  # de cima para baixo: cada osso volta para a matriz que tinha no quadro
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    for pb in sorted(arm.pose.bones, key=lambda p: len(p.parent_recursive)):
        pb.matrix = mats[pb.name]
        bpy.context.view_layer.update()


def _w(arm, v):
    return arm.matrix_world @ v


def _a(arm, v):
    return arm.matrix_world.inverted() @ v


def gira_osso(arm, pb, q_arm):
    """Gira o osso (e os filhos) em volta da cabeça dele, por um giro no espaço do esqueleto."""
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q_arm.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()


def aponta(arm, pb, alvo_mundo):
    """O osso passa a apontar (da cabeça para a ponta) para um ponto do mundo, com o menor giro."""
    alvo = _a(arm, alvo_mundo)
    d0 = (pb.tail - pb.head).normalized()
    d1 = (alvo - pb.head).normalized()
    gira_osso(arm, pb, d0.rotation_difference(d1))


def ik_braco(arm, lado, alvo_mundo, polo_mundo=None, alcance=0.98):
    """Dois ossos (braço e antebraço) até a mão (o punho) chegar ao alvo; o cotovelo vai para o lado do polo."""
    L = "Left" if lado == "esq" else "Right"
    up, lo, mao = arm.pose.bones[L + "Arm"], arm.pose.bones[L + "ForeArm"], arm.pose.bones[L + "Hand"]
    S, E, W = _w(arm, up.head), _w(arm, lo.head), _w(arm, mao.head)
    a, b = (E - S).length, (W - E).length
    T = Vector(alvo_mundo)
    d = min((T - S).length, (a + b) * alcance)
    u = (T - S).normalized()
    polo = Vector(polo_mundo) if polo_mundo is not None else (E + (E - (S + W) / 2) * 2)
    v = (polo - S)
    v = (v - u * v.dot(u)).normalized()
    cosA = max(-1, min(1, (a * a + d * d - b * b) / (2 * a * d)))
    E2 = S + u * (a * cosA) + v * (a * math.sqrt(1 - cosA * cosA))
    aponta(arm, up, E2)
    aponta(arm, lo, S + u * d)


def ik_perna(arm, lado, alvo_mundo, polo_mundo):
    L = "Left" if lado == "esq" else "Right"
    up, lo = arm.pose.bones[L + "UpLeg"], arm.pose.bones[L + "Leg"]
    S, E, W = _w(arm, up.head), _w(arm, lo.head), _w(arm, lo.tail)
    a, b = (E - S).length, (W - E).length
    T = Vector(alvo_mundo)
    d = min((T - S).length, (a + b) * 0.995)
    u = (T - S).normalized()
    v = Vector(polo_mundo) - S
    v = (v - u * v.dot(u)).normalized()
    cosA = max(-1, min(1, (a * a + d * d - b * b) / (2 * a * d)))
    aponta(arm, up, S + u * (a * cosA) + v * (a * math.sqrt(1 - cosA * cosA)))
    aponta(arm, lo, S + u * d)


def referencial_mao(arm, lado):
    """X dos dedos, Z da palma (como no referencial dos objetos de mão), no mundo."""
    L = "Left" if lado == "esq" else "Right"
    P = lambda n: _w(arm, arm.pose.bones[L + n].head)  # noqa: E731
    X = (P("HandMiddle1") - P("Hand")).normalized()
    t = P("HandIndex1") - P("HandPinky1")
    Z = (X.cross(t) if lado == "esq" else t.cross(X)).normalized()
    return X, Z


def orienta_mao(arm, lado, dedos, palma):
    """Gira a mão para os dedos irem para 'dedos' e a palma olhar para 'palma' (direções no mundo)."""
    L = "Left" if lado == "esq" else "Right"
    pb = arm.pose.bones[L + "Hand"]
    fa = arm.pose.bones[L + "ForeArm"]
    # primeiro o antebraço gira em volta do próprio eixo boa parte do giro que a palma precisa (como um braço de
    # verdade: o punho sozinho não torce 180°); depois a mão faz o resto
    X, Z = referencial_mao(arm, lado)
    eixo = (_w(arm, fa.tail) - _w(arm, fa.head)).normalized()
    Zd0 = Vector(palma)
    Zp = (Z - eixo * Z.dot(eixo))
    Zq = (Zd0 - eixo * Zd0.dot(eixo))
    if Zp.length > 1e-4 and Zq.length > 1e-4:
        Zp.normalize()
        Zq.normalize()
        ang = math.atan2(eixo.dot(Zp.cross(Zq)), Zp.dot(Zq))
        e_a = (arm.matrix_world.to_3x3().normalized().inverted() @ eixo).normalized()
        gira_osso(arm, fa, Quaternion(e_a, ang * 0.7))
    X, Z = referencial_mao(arm, lado)
    Xd = Vector(dedos).normalized()
    Zd = Vector(palma)
    Zd = (Zd - Xd * Zd.dot(Xd)).normalized()
    Mc = Matrix((X, Z.cross(X), Z)).transposed()
    Md = Matrix((Xd, Zd.cross(Xd), Zd)).transposed()
    Rw = Md @ Mc.transposed()
    Ra = arm.matrix_world.to_3x3().normalized().inverted() @ Rw @ arm.matrix_world.to_3x3().normalized()
    gira_osso(arm, pb, Ra.to_quaternion())


def fecha_dedos(arm, lado, quanto=0.6, polegar=0.3):
    """Dobra as falanges para a palma (mão apoiada ou segurando)."""
    L = "Left" if lado == "esq" else "Right"
    for pb in arm.pose.bones:
        if not pb.name.startswith(L + "Hand") or pb.name == L + "Hand":
            continue
        k = polegar if "Thumb" in pb.name else quanto
        pb.rotation_mode = "XYZ"
        pb.rotation_euler.x += k * (0.5 if pb.name.endswith("1") else 0.8)
    bpy.context.view_layer.update()


PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")


def sem_pernas(ob):
    """Parte de cima: a barra segue o quadril, não as coxas (senão abre em leque quando as pernas se mexem). A parte de
    saia (casaco longo, jaleco) mantém os pesos de pano dela."""
    import numpy as np_
    guarda = _pesos_da_saia(ob)
    n = len(ob.data.vertices)
    W = {g.name: np_.zeros(n) for g in ob.vertex_groups}
    idx = {g.index: g.name for g in ob.vertex_groups}
    for v in ob.data.vertices:
        for g in v.groups:
            W[idx[g.group]][v.index] = g.weight
    perna = sum((W[nm] for nm in PERNAS if nm in W), np_.zeros(n))
    resto = sum((W[nm] for nm in W if nm not in PERNAS), np_.zeros(n))
    quadril = W.get("Hips", np_.zeros(n))
    for nm in PERNAS:
        if nm in ob.vertex_groups:
            ob.vertex_groups[nm].remove(list(range(n)))
    if "Hips" in ob.vertex_groups:  # o peso que era das pernas vai para o quadril
        g = ob.vertex_groups["Hips"]
        for i in np_.nonzero(perna > 0)[0]:
            g.add([int(i)], float(quadril[i] + perna[i]), "REPLACE")
    if not guarda:  # com saia, a barra é a da saia
        alisa_pesos_barra(ob)
    _volta_pesos_da_saia(ob, guarda)


def alisa_pesos_barra(ob, faixa=0.14, voltas=24):
    """A barra da parte de cima anda inteira: nos últimos 14 cm da peça (em descanso), os pesos se misturam com os dos
    vizinhos (várias voltas) e, por fim, cada altura fica com a média da sua volta inteira. Antes, atrás, a barra
    pegava o peso do quadril sozinho e, na pose, caía em aba sobre o bumbum."""
    import numpy as np_
    me = ob.data
    n = len(me.vertices)
    if not n:
        return
    P = np_.array([v.co[:] for v in me.vertices])
    mw = np_.array(ob.matrix_world)
    Pw = P @ mw[:3, :3].T + mw[:3, 3]
    tronco = np_.abs(Pw[:, 0]) < 0.6 * (Pw[:, 0].max() - Pw[:, 0].min()) / 2 + 0.05
    z0 = Pw[tronco, 2].min() if tronco.any() else Pw[:, 2].min()
    zona = tronco & (Pw[:, 2] < z0 + faixa)
    if zona.sum() < 4:
        return
    nomes = [g.name for g in ob.vertex_groups]
    W = np_.zeros((n, len(nomes)))
    for v in me.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    viz = [[] for _ in range(n)]
    for e in me.edges:
        a_, b_ = e.vertices
        viz[a_].append(b_)
        viz[b_].append(a_)
    idx = np_.nonzero(zona)[0]
    for _ in range(voltas):
        W2 = W.copy()
        for i in idx:
            if viz[i]:
                W2[i] = 0.5 * W[i] + 0.5 * W[viz[i]].mean(0)
        W = W2
    # perto da borda, a mesma mistura em toda a volta (por faixas de 1 cm), indo aos poucos até a mistura local
    fx = np_.floor((Pw[:, 2] - z0) / 0.01).astype(int)
    for k in np_.unique(fx[zona]):
        sel = zona & (fx == k)
        t_ = min(max((Pw[sel, 2].mean() - z0) / faixa, 0.0), 1.0)
        W[sel] = (1 - t_) * W[sel].mean(0) + t_ * W[sel]
    W /= np_.maximum(W.sum(1, keepdims=True), 1e-6)
    for j, nm in enumerate(nomes):
        g = ob.vertex_groups[nm]
        for i in idx:
            if W[i, j] > 1e-4:
                g.add([int(i)], float(W[i, j]), "REPLACE")
            else:
                g.remove([int(i)])


def _pesos(ob):
    import numpy as np_
    nomes = [g.name for g in ob.vertex_groups]
    W = np_.zeros((len(ob.data.vertices), len(nomes)))
    for v in ob.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    return nomes, W


def barra_no_colo(ob, corpo, faixa=0.13):
    """Sentado: a frente da barra da parte de cima deita no colo (segue o quadril e as duas coxas misturadas, pelo lado);
    sem isso ela ficava pendurada na frente da virilha e, de cima, a camisa parecia um colan entre as coxas. Atrás
    (onde a pessoa senta) segue o quadril."""
    import numpy as np_
    nomes, W = _pesos(ob)
    for nm in ("Hips", "LeftUpLeg", "RightUpLeg"):
        if nm not in ob.vertex_groups:
            ob.vertex_groups.new(name=nm)
            nomes.append(nm)
            W = np_.hstack([W, np_.zeros((W.shape[0], 1))])
    ih, il, ir = (nomes.index(n) for n in ("Hips", "LeftUpLeg", "RightUpLeg"))
    mw = ob.matrix_world
    P = np_.array([mw @ v.co for v in ob.data.vertices])
    arm = next(m.object for m in ob.modifiers if m.type == "ARMATURE")
    pl = arm.matrix_world @ arm.data.bones["LeftUpLeg"].head_local
    pr = arm.matrix_world @ arm.data.bones["RightUpLeg"].head_local
    cx, cy = (pl.x + pr.x) / 2, (pl.y + pr.y) / 2
    sl = 1.0 if pl.x > cx else -1.0
    meia = max(abs(pl.x - pr.x) / 2, 0.02)
    tronco = np_.abs(P[:, 0] - cx) < 0.3
    if not tronco.any():
        return
    z0 = P[tronco, 2].min()
    for j in np_.nonzero(tronco & (P[:, 2] < z0 + faixa))[0]:
        t_ = 1 - (P[j, 2] - z0) / faixa
        frente = min(max((cy - P[j, 1]) / 0.06, 0.0), 1.0)  # a frente é -y
        a = t_ * frente
        if a <= 0:
            continue
        wl = min(max(0.5 + 0.5 * (P[j, 0] - cx) * sl / (meia * 2.0), 0.0), 1.0)
        alvo = np_.zeros(len(nomes))
        alvo[ih], alvo[il], alvo[ir] = 0.35, 0.65 * wl, 0.65 * (1 - wl)
        W[j] = (1 - a) * W[j] + a * alvo
    for k, nm in enumerate(nomes):
        g = ob.vertex_groups[nm]
        for j in np_.nonzero(tronco & (P[:, 2] < z0 + faixa))[0]:
            if W[j, k] > 1e-4:
                g.add([int(j)], float(W[j, k]), "REPLACE")
            else:
                g.remove([int(j)])


def barra_enfiada(ob, quanto=0.055):
    """Sentado: a parte de cima fica por dentro da calça (os últimos centímetros do tronco saem). Pendurada, a barra
    caía entre as coxas e, de cima, parecia um colan."""
    import bmesh
    mw = ob.matrix_world
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    zs = [(mw @ v.co).z for v in bm.verts]
    if not zs:
        bm.free()
        return
    xs = [(mw @ v.co).x for v in bm.verts]
    cx = (max(xs) + min(xs)) / 2
    tronco = [v for v in bm.verts if abs((mw @ v.co).x - cx) < 0.25]
    z0 = min((mw @ v.co).z for v in tronco) if tronco else min(zs)
    corte = z0 + quanto
    apagar = [f for f in bm.faces if all((mw @ v.co).z < corte for v in f.verts) and all(abs((mw @ v.co).x - cx) < 0.25 for v in f.verts)]
    bmesh.ops.delete(bm, geom=apagar, context="FACES")
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def alisa_fundilho_posado(p, raio=0.17, voltas=24):
    """Foto parada, pernas abertas (deitado, sentado): a calça já na pose (o esqueleto aplicado na malha) tem o gancho
    alisado (cada ponto perto do meio das virilhas vai para a média dos vizinhos, mais no centro) e depois volta para
    fora da pele (3 mm). Tira a "barbatana" de pano que o cruzamento das coxas fazia entre as pernas."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    arm = p["arm"]
    c = p["corpo"]
    corpo = bpy.data.objects[c + "_corpo"]
    centro = (osso(arm, "LeftUpLeg") + osso(arm, "RightUpLeg")) / 2
    dg = bpy.context.evaluated_depsgraph_get()
    ev = corpo.evaluated_get(dg)
    me_c = ev.to_mesh()
    Pc = [ev.matrix_world @ v.co for v in me_c.vertices]
    arv = BVHTree.FromPolygons(Pc, [list(pl.vertices) for pl in me_c.polygons])
    ev.to_mesh_clear()
    for rid, _ in p["roupa"]:
        it = R._resolve(R.ITENS[rid])
        if it.get("slot") not in ("baixo", "inteira") or it.get("tipo") != "pele":
            continue
        ob = bpy.data.objects.get(f"{c}_{rid}")
        if ob is None or ob.data.shape_keys:
            continue
        mod = next((m for m in ob.modifiers if m.type == "ARMATURE"), None)
        if mod is None:
            continue
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        mw, mi = ob.matrix_world, ob.matrix_world.inverted()
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        P = {v: mw @ v.co for v in bm.verts}
        zona = {v: max(0.0, 1 - (P[v] - centro).length / raio) for v in bm.verts if (P[v] - centro).length < raio}
        for _ in range(voltas):
            novo = {}
            for v, w in zona.items():
                viz = [e.other_vert(v) for e in v.link_edges]
                if viz:
                    m_ = sum((P[u] for u in viz), Vector()) / len(viz)
                    novo[v] = P[v] + (m_ - P[v]) * 0.6 * min(1.0, w * 1.6)
            P.update(novo)
        for v in zona:
            loc, nrm, _, _ = arv.find_nearest(P[v])
            if loc is not None and (P[v] - loc).dot(nrm) < 0.003:
                P[v] = loc + nrm * 0.003
            v.co = mi @ P[v]
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        print("fundilho alisado", p["id"], rid, len(zona), flush=True)


def fundilho_no_quadril(ob, corpo):
    """Calça: o fundilho (entre as pernas, perto do gancho) segue mais o quadril que as coxas. Com as pernas abertas
    (deitado, sentado no chão) os pontos do meio, puxados por uma coxa e pela outra, faziam uma dobra esquisita."""
    import numpy as np_
    nomes, W = _pesos(ob)
    if "Hips" not in nomes:
        return
    arm = next((m.object for m in ob.modifiers if m.type == "ARMATURE"), None)
    if arm is None or "LeftUpLeg" not in arm.data.bones:
        return
    ih = nomes.index("Hips")
    pernas = [nomes.index(n) for n in nomes if n.endswith("UpLeg")]
    pl = arm.matrix_world @ arm.data.bones["LeftUpLeg"].head_local
    pr = arm.matrix_world @ arm.data.bones["RightUpLeg"].head_local
    cx = (pl.x + pr.x) / 2
    zq = (pl.z + pr.z) / 2
    larg = max(abs(pl.x - pr.x) * 0.6, 0.03)
    mw = ob.matrix_world
    P = np_.array([mw @ v.co for v in ob.data.vertices])
    sel = (np_.abs(P[:, 0] - cx) < larg) & (P[:, 2] < zq + 0.03) & (P[:, 2] > zq - 0.16)
    mud = []
    for j in np_.nonzero(sel)[0]:
        a = (1 - abs(P[j, 0] - cx) / larg) * min(1.0, (P[j, 2] - (zq - 0.16)) / 0.06) * 0.7
        if a <= 0:
            continue
        q = W[j, pernas].sum() * a
        if q <= 0:
            continue
        for k in pernas:
            W[j, k] *= (1 - a)
        W[j, ih] += q
        mud.append(j)
    for k, nm in enumerate(nomes):
        g = ob.vertex_groups[nm]
        for j in mud:
            if W[j, k] > 1e-4:
                g.add([int(j)], float(W[j, k]), "REPLACE")
            else:
                g.remove([int(j)])


def folga_extra(ob, quanto=0.0025):
    """Um pouco de folga a mais em toda a peça (pela normal): nas poses, onde o corpo dobra, a pele não atravessa."""
    me = ob.data
    me.update()
    for v in me.vertices:
        v.co += v.normal * quanto
    me.update()


def pesos_da_pele(ob, corpo, manter_saia=True):
    """A peça passa a usar os pesos da pele logo embaixo dela (interpolados na face mais perto), em descanso: assim ela
    dobra igual ao corpo em qualquer pose (os pesos que vêm da malha do pacote descolam o cós quando a coluna dobra)."""
    guarda = _pesos_da_saia(ob) if manter_saia else {}
    for g in corpo.vertex_groups:
        if g.name not in ob.vertex_groups:
            ob.vertex_groups.new(name=g.name)
    dt = ob.modifiers.new("pesos da pele", "DATA_TRANSFER")
    dt.object = corpo
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    dt.layers_vgroup_select_src = "ALL"
    dt.layers_vgroup_select_dst = "NAME"
    ob.modifiers.move(ob.modifiers.find(dt.name), 0)
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=dt.name)
    _volta_pesos_da_saia(ob, guarda)


def _pesos_da_saia(ob):
    """Os pesos da parte de saia (feitos no encaixe, como pano: quadril e as duas coxas), guardados por vértice."""
    if "saia" not in ob.data.attributes:
        return {}
    import numpy as np_
    sa = np_.zeros(len(ob.data.vertices))
    ob.data.attributes["saia"].data.foreach_get("value", sa)
    nomes = {g.index: g.name for g in ob.vertex_groups}
    return {i: [(nomes[g.group], g.weight) for g in ob.data.vertices[int(i)].groups] for i in np_.nonzero(sa > 0.5)[0]}


def _volta_pesos_da_saia(ob, guarda):
    for i, gs in guarda.items():
        for g in ob.vertex_groups:
            g.remove([int(i)])
        for nm, w in gs:
            (ob.vertex_groups.get(nm) or ob.vertex_groups.new(name=nm)).add([int(i)], w, "REPLACE")


def cabelo_sob_chapeu(cabelos, chapeu, arm, folga=0.006):
    """O cabelo não atravessa o chapéu: do centro da cabeça, cada ponto do cabelo que passaria da copa (o raio até ele
    cruza o chapéu antes) volta para dentro dela. Abaixo da aba o raio não cruza a copa e o cabelo fica como está."""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    ev = chapeu.evaluated_get(dg)
    me = ev.to_mesh()
    vs = [ev.matrix_world @ v.co for v in me.vertices]
    arv = BVHTree.FromPolygons(vs, [list(pl.vertices) for pl in me.polygons])
    ev.to_mesh_clear()
    hb = arm.pose.bones["Head"]
    c = arm.matrix_world @ hb.head.lerp(hb.tail, 0.35)
    n = 0
    for cab in cabelos:
        mw, mi = cab.matrix_world, cab.matrix_world.inverted()
        presos = set()
        for v in cab.data.vertices:
            p = mw @ v.co
            d = p - c
            L = d.length
            if L < 1e-6:
                continue
            hit = arv.ray_cast(c, d / L, 1.0)
            if hit[0] is not None and L > hit[3] - folga:
                v.co = mi @ (c + d / L * max(hit[3] - folga, 0.0))
                presos.add(v.index)
                n += 1
            elif hit[0] is None:
                # logo abaixo da borda: o raio um pouco mais para cima acerta o chapéu; o ponto entra aos poucos (todo a
                # 0°, nada a 14°), para a linha do cabelo sair lisa embaixo da borda em vez de serrilhada
                u = d / L
                lado = Vector((0, 0, 1)) - u * u.z
                if lado.length < 1e-6:
                    continue
                lado.normalize()
                for graus in (3, 6, 9, 12):
                    ang = math.radians(graus)
                    h2 = arv.ray_cast(c, (u * math.cos(ang) + lado * math.sin(ang)).normalized(), 1.0)
                    if h2[0] is not None:
                        w = 1 - graus / 14
                        dentro = min(L, h2[3] - folga)
                        if dentro < L:
                            v.co = mi @ (c + u * (L * (1 - w) + dentro * w))
                        break
        # logo abaixo da borda do chapéu, uns pontos entravam e os vizinhos não: a linha do cabelo ficava serrilhada.
        # Nas duas voltas de vértices em volta dos que entraram, a distância ao centro da cabeça vira a média dos vizinhos
        viz = [[] for _ in cab.data.vertices]
        for e in cab.data.edges:
            a_, b_ = e.vertices
            viz[a_].append(b_)
            viz[b_].append(a_)
        faixa = {j for i in presos for j in viz[i]} - presos
        faixa |= {k for j in faixa for k in viz[j]} - presos
        for _ in range(3):
            dist = {i: ((mw @ cab.data.vertices[i].co) - c).length for i in faixa | presos | {k for j in faixa for k in viz[j]}}
            for i in faixa:
                if not viz[i]:
                    continue
                p = mw @ cab.data.vertices[i].co
                d = p - c
                if d.length < 1e-6:
                    continue
                alvo = sum(dist[k] for k in viz[i]) / len(viz[i])
                if alvo < d.length:  # só para dentro
                    cab.data.vertices[i].co = mi @ (c + d.normalized() * (0.5 * d.length + 0.5 * alvo))
        cab.data.update()
    print("cabelo sob o chapéu", chapeu.name, n, flush=True)


def esconde_pele_coberta(corpo, roupas, alcance=0.035):
    """A pele embaixo da roupa não é desenhada (como na página): em descanso, cada vértice do corpo procura uma peça ao
    longo da normal (até 3,5 cm); os cobertos, menos a faixa da borda (para não abrir fresta na barra), saem por um
    modificador de máscara."""
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    dg = bpy.context.evaluated_depsgraph_get()
    arvores = []
    for o in roupas:
        if any(m and "arrastao" in m.name.lower() for m in o.data.materials):
            continue  # a trama com furos deixa a pele aparecer
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        vs = [ev.matrix_world @ v.co for v in me.vertices]
        # a borda aberta da peça (barra, cós, gola, punho): perto dela a pele fica, senão o avesso aparece por cima
        cont = {}
        for pl in me.polygons:
            for k in range(len(pl.vertices)):
                e = tuple(sorted((pl.vertices[k], pl.vertices[(k + 1) % len(pl.vertices)])))
                cont[e] = cont.get(e, 0) + 1
        bvs = {i for e, n in cont.items() if n == 1 for i in e}
        kd = KDTree(max(len(bvs), 1))
        for i in bvs:
            kd.insert(vs[i], i)
        kd.balance()
        arvores.append((BVHTree.FromPolygons(vs, [list(pl.vertices) for pl in me.polygons]), kd, bool(bvs)))
        ev.to_mesh_clear()
    if not arvores:
        return
    ev = corpo.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    n3 = mw.to_3x3().inverted().transposed()
    coberto = np.zeros(len(me.vertices), bool)
    for v in me.vertices:
        p = mw @ v.co
        n = (n3 @ v.normal).normalized()
        for t_, kd, tem_borda in arvores:
            hit = t_.ray_cast(p - n * 0.003, n, alcance)
            if hit[0] is not None and (not tem_borda or kd.find(hit[0])[2] > 0.025):
                coberto[v.index] = True
                break
    viz = [[] for _ in me.vertices]
    for e in me.edges:
        a_, b_ = e.vertices
        viz[a_].append(b_)
        viz[b_].append(a_)
    ev.to_mesh_clear()
    for _ in range(1):  # a borda fica: tira dos cobertos quem encosta num descoberto
        borda = [i for i in np.nonzero(coberto)[0] if any(not coberto[j] for j in viz[i])]
        coberto[borda] = False
    vg = corpo.vertex_groups.get("coberta") or corpo.vertex_groups.new(name="coberta")
    vg.add([int(i) for i in np.nonzero(coberto)[0]], 1.0, "REPLACE")
    mk = corpo.modifiers.new("pele coberta", "MASK")
    mk.vertex_group = "coberta"
    mk.invert_vertex_group = True
    while corpo.modifiers[0] != mk:  # antes do esqueleto
        bpy.ops.object.modifier_move_up({"object": corpo}, modifier=mk.name) if False else corpo.modifiers.move(corpo.modifiers.find(mk.name), 0)
    print("pele coberta", corpo.name, int(coberto.sum()), "de", len(coberto), flush=True)


def osso(arm, nome, onde="head"):
    pb = arm.pose.bones[nome]
    return _w(arm, getattr(pb, onde))


def no_chao(arm, malhas):
    """Desce ou sobe o lugar para o ponto mais baixo das malhas ficar no chão."""
    dg = bpy.context.evaluated_depsgraph_get()
    zmin = min((o.evaluated_get(dg).matrix_world @ v.co).z for o in malhas for v in o.evaluated_get(dg).data.vertices)
    arm.parent.location.z -= zmin
    bpy.context.view_layer.update()


# ------------------------------------------------------------------ montagem
def monta_pessoa(p):
    c = p["corpo"]
    arm = bpy.data.objects[c]
    corpo = bpy.data.objects[c + "_corpo"]
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    malhas = [corpo]
    # rosto feliz, os outros escondidos
    for o in [o for o in bpy.data.objects if o.name.startswith(c + "_rosto_")]:
        expr = c + "_rosto_" + p.get("expr", "confiante")
        o.hide_render = o.hide_viewport = o.name != expr
        if o.name == expr:
            malhas.append(o)
    # cabelo: o do catálogo (encaixado agora, se o mestre não tem) e a cor
    for o in [o for o in bpy.data.objects if o.name.startswith(c + "_cabelo") or o.name.startswith(c + "_barba")
              or o.name.startswith(c + "_bigode")]:
        o.hide_render = o.hide_viewport = True
    if p["cabelo"]:  # sem cabelo: a touca cobre a cabeça toda
        cab_id, cab_cor = p["cabelo"]
        nome = c + "_" + cab_id if cab_id != "cabelo" else c + "_cabelo"
        ob = bpy.data.objects.get(nome)
        if ob is None:
            ob = CAB.encaixa(CAB.ITENS[cab_id], arm, corpo, PACOTES)
            ob.name = nome
        ob.hide_render = ob.hide_viewport = False
        cor_lisa(ob, cab_cor)
        malhas.append(ob)
    for pel in p.get("pelos", []):
        ob = bpy.data.objects.get(c + "_" + pel) or CAB.encaixa(CAB.ITENS[pel], arm, corpo, PACOTES)
        ob.hide_render = ob.hide_viewport = False
        cor_lisa(ob, p.get("cor_pelos") or p["cabelo"][1])
        malhas.append(ob)
    # roupas
    for rid, cor in p["roupa"]:
        item = R.ITENS[rid]
        try:
            ob = R.veste(item, arm, corpo, PACOTES)
        except Exception as e:
            print("falhou", c, rid, repr(e), flush=True)
            continue
        ob.name = f"{c}_{rid}"
        ob.hide_render = ob.hide_viewport = False  # as peças dos pacotes chegam escondidas (fonte importada)
        if not any(m.type == "ARMATURE" for m in ob.modifiers):  # chapéu e óculos: presos ao osso da cabeça
            g = ob.vertex_groups.new(name="Head")
            g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
            ob.modifiers.new("Esqueleto", "ARMATURE").object = arm
        elif item.get("tipo") == "pele" or item.get("compoe") or R._resolve(item).get("tipo") == "pele":
            # sentado, ajoelhado ou deitado: a coxa sobe e a saia de pano (meio de cada coxa) ficaria para trás com a perna
            # atravessando; nessas poses a saia segue a pele embaixo dela, como o resto da peça
            dobra = any(k in (p.get("pose") or ("",))[0] for k in (".sit", ".kneel", ".lie", "propose", ".crouch"))
            pesos_da_pele(ob, corpo, manter_saia=not dobra)
            slot_ = R._resolve(item).get("slot")
            if slot_ in ("cima", "sobre"):
                sem_pernas(ob)
                if dobra and slot_ == "cima":
                    barra_enfiada(ob)
            if slot_ in ("baixo", "inteira"):
                fundilho_no_quadril(ob, corpo)
            if slot_ in ("cima", "baixo", "inteira", "sobre"):
                folga_extra(ob, 0.004 if slot_ == "sobre" else 0.0025)
        tinge(ob, rid, cor or (item.get("variacao") or {}).get("cor"))
        malhas.append(ob)
    chapeus = [m for m in malhas if m.name in {f"{c}_{r}" for r, _ in p["roupa"]}
               and R.ITENS[m.name[len(c) + 1:]].get("slot") == "cabeca" and R.ITENS[m.name[len(c) + 1:]].get("achata") is not False]
    cabelos = [m for m in malhas if m.name.startswith(c + "_cabelo")]
    for ch in chapeus:
        cabelo_sob_chapeu(cabelos, ch, arm)
    if p.get("tom"):
        tom_de_pele(corpo, p["tom"])
        for o in [o for o in bpy.data.objects if o.name.startswith(c + "_rosto_")]:
            tom_de_pele(o, p["tom"])
    esconde_pele_coberta(corpo, [m for m in malhas if m.name.startswith(c + "_") and m.name[len(c) + 1:] in {r for r, _ in p["roupa"]}])
    p["arm"], p["malhas"] = arm, malhas
    if not os.environ.get("SEMPOSE"):
        pose_da_biblioteca(arm, c, *p["pose"])
    if p["lugar"]:
        x, y, g = p["lugar"]
        arm.parent.location = (x * 0.9, y, 0)
        arm.parent.rotation_euler = (0, 0, math.radians(g))
    bpy.context.view_layer.update()
    print("pessoa", p["id"], c, len(malhas), "malhas", flush=True)
    return p


def acha_texturas():
    """O mestre guarda caminhos relativos a outra pasta: cada imagem que não abre é procurada pelo nome dentro do
    pacote de origem (ideias/<pacote>/...), de preferência numa pasta de texturas."""
    idx = {}
    for raiz, _, arqs in os.walk(PACOTES):
        for f in arqs:
            if f.lower().endswith((".png", ".jpg", ".jpeg")):
                idx.setdefault(f, []).append(os.path.join(raiz, f))
    for extra in ("roupas_gen", "roupas_mascaras"):
        for f in os.listdir(os.path.join(AQUI, "biblioteca", extra)) if os.path.isdir(os.path.join(AQUI, "biblioteca", extra)) else []:
            idx.setdefault(f, []).append(os.path.join(AQUI, "biblioteca", extra, f))
    n = 0
    for im in bpy.data.images:
        if not im.filepath or im.packed_file or os.path.exists(bpy.path.abspath(im.filepath)):
            continue
        fp = im.filepath.replace("\\", "/")
        nome = os.path.basename(fp)
        pacote = fp.split("ideias/")[1].split("/")[0] if "ideias/" in fp else None
        cands = idx.get(nome, [])
        if pacote:
            cands = [c for c in cands if f"/{pacote}/" in c] or cands
        if cands:
            cands.sort(key=lambda c: ("textur" not in c.lower(), len(c)))
            im.filepath = cands[0]
            im.reload()
            n += 1
        else:
            print("textura não achada", im.name, fp)
    print("texturas achadas", n)


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    blend, saida = a[0], a[1]
    salva = a[2] if len(a) > 2 and not a[2].startswith("--") else None
    rapido = "--rapido" in a
    bpy.ops.wm.open_mainfile(filepath=blend)
    acha_texturas()
    usados = {p["corpo"] for p in PESSOAS}
    for o in list(bpy.data.objects):  # só os corpos da foto
        dono = next((c for c in usados if o.name == c or o.name.startswith(c + "_")), None)
        if o.type in ("LIGHT", "CAMERA") or (dono is None and o.type in ("MESH", "ARMATURE", "EMPTY")):
            bpy.data.objects.remove(o, do_unlink=True)
    for p in PESSOAS:
        monta_pessoa(p)
    if not os.environ.get("SEMPOSE"):
        ajustes(PESSOAS)
        ajustes_finais(PESSOAS)
    acha_texturas()  # as peças importadas agora (corrente, sapatos) trazem caminhos de outra pasta também
    estudio(saida, rapido)
    R.limpa_fontes()
    if salva:
        bpy.ops.wm.save_as_mainfile(filepath=salva, compress=True)
    print("fim")


def P(id_):
    return next(p for p in PESSOAS if p["id"] == id_)


V = Vector


def ajustes(ps):
    """Os gestos da foto (IK nos braços), com todos no lugar e no chão."""
    for p in ps:
        if p["lugar"] and p["id"] not in ("menina", "menina_colo"):
            no_chao(p["arm"], [m for m in p["malhas"] if m.name.endswith("_corpo")])
    # o casal da esquerda: a mão esquerda dele no ombro direito dela; a mão direita dela vai até a dele
    magro, moca = P("magro")["arm"], P("moca")["arm"]
    ombro = osso(moca, "RightArm") + V((0.03, 0.0, 0.06))
    ik_braco(magro, "esq", ombro + V((0, 0.03, 0.03)), osso(magro, "LeftArm") + V((0.3, 0.4, -0.5)))
    orienta_mao(magro, "esq", V((0.15, -0.6, -0.8)), V((0, 0.1, -1)))
    fecha_dedos(magro, "esq", 0.35, 0.15)
    ik_braco(moca, "dir", osso(magro, "LeftHand") + V((0.06, -0.06, -0.05)), osso(moca, "RightArm") + V((-0.2, 0.1, -0.6)))
    orienta_mao(moca, "dir", V((0.4, 0.2, 0.9)), V((0, 1, -0.2)))
    fecha_dedos(moca, "dir", 0.4, 0.2)
    # o pai com a menina no braço esquerdo: o antebraço na horizontal, para a frente, debaixo dela
    pai, mc = P("pai")["arm"], P("menina_colo")["arm"]
    S = osso(pai, "LeftArm")
    mao_pai = S + V((0.1, -0.24, -0.36))
    ik_braco(pai, "esq", mao_pai, S + V((0.35, 0.25, -0.4)))
    orienta_mao(pai, "esq", V((-0.5, -0.4, 0.15)), V((0, 0, 1)))
    fecha_dedos(pai, "esq", 0.5, 0.2)
    # a menina sentada no antebraço dele (o quadril um pouco acima, encostada no peito)
    cot = osso(pai, "LeftForeArm")
    assento = cot.lerp(osso(pai, "LeftHand"), 0.45) + V((0.0, 0.02, 0.07))
    mc.parent.location += assento - osso(mc, "Hips")
    bpy.context.view_layer.update()
    # a mão direita dela na frente do ombro dele (sem entrar no pescoço nem na barba), o cotovelo para baixo
    peito_pai = osso(pai, "LeftShoulder").lerp(osso(pai, "LeftArm"), 0.5) + V((-0.01, -0.09, -0.02))
    ik_braco(mc, "dir", peito_pai, osso(mc, "RightArm") + V((0.05, -0.15, -0.35)))
    orienta_mao(mc, "dir", V((-0.4, 0.1, 0.9)), V((-0.2, 1.0, 0.1)))
    fecha_dedos(mc, "dir", 0.35, 0.1)
    ik_braco(mc, "esq", osso(mc, "LeftArm") + V((0.12, -0.08, 0.2)), osso(mc, "LeftArm") + V((0.4, 0.2, -0.2)))
    orienta_mao(mc, "esq", V((0.1, 0, 1)), V((0, -1, 0)))
    cao = cachorro("labrador", (1.02, -0.3, 8), "parado", 30)
    # os avós: a mão esquerda dele com a guia, a direita na cabeça do cachorro; ela abraça o ombro dele
    avo, avoa = P("avo")["arm"], P("avoa")["arm"]
    S = osso(avo, "LeftArm")
    ik_braco(avo, "esq", S + V((0.1, -0.2, -0.42)), S + V((0.4, 0.3, -0.3)))
    Yd = V((0, -1, -0.25)).normalized()
    Zd = V((-1, 0, 0))
    orienta_mao(avo, "esq", Yd.cross(Zd), Zd)
    fecha_dedos(avo, "esq", 0.9, 0.5)
    # ela: a mão direita pousada no ombro dele, o cotovelo para baixo e um pouco para trás; o outro braço solto
    ombro_avo = osso(avo, "LeftArm").lerp(osso(avo, "LeftShoulder"), 0.35) + V((0.0, 0.0, 0.06))
    ik_braco(avoa, "dir", ombro_avo + V((0.03, 0.0, 0.02)), osso(avoa, "RightArm") + V((-0.05, 0.25, -0.55)))
    orienta_mao(avoa, "dir", V((-0.75, -0.35, -0.55)), V((0.1, 0.15, -1)))
    fecha_dedos(avoa, "dir", 0.3, 0.1)
    # a mão direita dele no alto da cabeça do cachorro (o tronco inclina um pouco para a frente e para o cachorro)
    R3 = avo.matrix_world.to_3x3().normalized()
    for nome_o, ang in (("Spine", 9), ("Spine1", 6)):
        eixo = (R3.inverted() @ V((1, 0, 0.35))).normalized()
        gira_osso(avo, avo.pose.bones[nome_o], Quaternion(eixo, math.radians(ang)))
    cab_cao = cao.matrix_world @ cao.pose.bones["Head"].head
    ik_braco(avo, "dir", cab_cao + V((0.0, 0.03, 0.13)), osso(avo, "RightArm") + V((-0.4, 0.3, -0.3)))
    orienta_mao(avo, "dir", V((0.1, -0.9, -0.3)), V((0, 0, -1)))
    fecha_dedos(avo, "dir", 0.3, 0.1)
    guia(P("avo"), cao)
    # o menino com a mão no peito
    me_ = P("menino")["arm"]
    ik_braco(me_, "dir", osso(me_, "Spine1").lerp(osso(me_, "Neck"), 0.4) + V((0.03, -0.1, 0.0)), osso(me_, "RightArm") + V((-0.3, 0.1, -0.4)))
    orienta_mao(me_, "dir", V((1, 0, 0.3)), V((0, 1, 0)))
    # a vovó ajoelhada e a menina sentada no joelho que está para cima
    vv, mn = P("vovo")["arm"], P("menina")["arm"]
    joelhos = {l: osso(vv, l + "Leg") for l in ("Left", "Right")}
    lado = max(joelhos, key=lambda l: joelhos[l].z)
    coxa = osso(vv, lado + "UpLeg").lerp(joelhos[lado], 0.6)
    mn.parent.location += coxa + V((0, 0.0, 0.1)) - osso(mn, "Hips")
    mn.parent.rotation_euler.z += math.radians(-15 if lado == "Left" else 15)
    bpy.context.view_layer.update()
    mn.parent.location += coxa + V((0, 0.0, 0.1)) - osso(mn, "Hips")
    bpy.context.view_layer.update()
    lv = "esq" if lado == "Right" else "dir"  # a mão do outro lado segura a menina pela cintura, por trás
    ik_braco(vv, lv, osso(mn, "Hips") + V((0.0, 0.08, 0.06)), osso(vv, ("Left" if lv == "esq" else "Right") + "Arm") + V((0, 0.4, -0.4)))
    lado_v = "dir" if lv == "esq" else "esq"
    ik_braco(vv, lado_v, osso(mn, ("Left" if lado == "Left" else "Right") + "UpLeg").lerp(osso(mn, ("Left" if lado == "Left" else "Right") + "Leg"), 0.5) + V((0, -0.04, 0.04)),
             osso(vv, ("Right" if lado_v == "dir" else "Left") + "Arm") + V((0, 0.2, -0.5)))


def cachorro(id_, lugar, anim, quadro):
    """Um bicho da biblioteca de bichos (pets/bichos.blend), parado num quadro de uma animação."""
    nome = "bicho_" + id_
    with bpy.data.libraries.load(BICHOS, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in (nome, nome + "_malha")]
    for o in dst.objects:
        bpy.context.scene.collection.objects.link(o)
    arm = bpy.data.objects[nome]
    e = bpy.data.objects.new("lugar_" + id_, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = (lugar[0], lugar[1], 0)
    e.rotation_euler.z = math.radians(lugar[2])
    arm.parent = e
    arm.location = (0, 0, 0)
    arm.rotation_euler = (math.radians(90), 0, 0)
    ad = arm.animation_data
    t_ = ad.nla_tracks.get(anim)
    ad.action = t_.strips[0].action
    if ad.action.slots:
        ad.action_slot = ad.action.slots[0]
    for tt in ad.nla_tracks:
        tt.mute = True
    bpy.context.scene.frame_set(quadro)
    bpy.context.view_layer.update()
    # congela o quadro (a cena não anda)
    mats = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
    ad.action = None
    for pb in sorted(arm.pose.bones, key=lambda p: len(p.parent_recursive)):
        pb.matrix = mats[pb.name]
        bpy.context.view_layer.update()
    for o in dst.objects:
        if o.type == "MESH":
            o.hide_render = o.hide_viewport = False
    return arm


def guia(p_avo, cao):
    """A guia: da saída da caixa da guia retrátil (o ponto da peça mais à frente) até a coleira, um pouco caída."""
    dg = bpy.context.evaluated_depsgraph_get()
    ob = bpy.data.objects[p_avo["corpo"] + "_nov_guia_retratil"].evaluated_get(dg)
    pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
    ini = min(pts, key=lambda q: q.y + 0.3 * q.x)
    fim = cao.matrix_world @ cao.pose.bones["Neck"].head.lerp(cao.pose.bones["Neck"].tail, 0.5)
    fim = fim + Vector((0.02, 0.0, -0.03))
    cu = bpy.data.curves.new("guia", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.0035
    cu.bevel_resolution = 2
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(2)
    meio = ini.lerp(fim, 0.5) + Vector((0, 0, -0.07))
    for bp, q in zip(sp.bezier_points, (ini, meio, fim)):
        bp.co = q
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new("guia", cu)
    bpy.context.scene.collection.objects.link(o)
    m = bpy.data.materials.new("guia")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*_rgb("#D8DCE2"), 1)
    cu.materials.append(m)


def ajustes_finais(ps):
    pass


def ciclorama():
    """Chão que sobe em curva atrás das pessoas (sem linha de horizonte)."""
    import bmesh
    bm = bmesh.new()
    perfil = []
    for k in range(40):  # y, z: plano até y = 1.6, quarto de círculo de raio 3, parede até 12 m
        a_ = math.pi / 2 * k / 39
        perfil.append((1.6 + 3 * math.sin(a_), 3 - 3 * math.cos(a_)))
    perfil = [(-12.0, 0.0), (1.6, 0.0)] + perfil[1:] + [(4.6, 12.0)]
    linhas = []
    for x in (-15.0, 15.0):
        linhas.append([bm.verts.new((x, y, z)) for y, z in perfil])
    for i in range(len(perfil) - 1):
        bm.faces.new((linhas[0][i], linhas[1][i], linhas[1][i + 1], linhas[0][i + 1]))
    me = bpy.data.meshes.new("ciclorama")
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    o = bpy.data.objects.new("ciclorama", me)
    bpy.context.scene.collection.objects.link(o)
    return o


def estudio(saida, rapido):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = 16 if rapido else 96
    scn.cycles.use_denoising = True
    scn.cycles.device = "CPU"
    scn.render.resolution_x, scn.render.resolution_y = (960, 540) if rapido else (2000, 1125)
    if os.environ.get("RES"):
        scn.render.resolution_x, scn.render.resolution_y = map(int, os.environ["RES"].split("x"))
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("fundo")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*_rgb("#1C2038"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    chao = ciclorama()
    m = bpy.data.materials.new("chao")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*_rgb("#232846"), 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    chao.data.materials.append(m)
    bpy.ops.object.light_add(type="AREA", location=(-2.5, -4.5, 4.5))
    k = bpy.context.active_object
    k.data.energy = 1300
    k.data.size = 5
    k.rotation_euler = (Vector((0, 0, 1.0)) - k.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(3.5, -3.0, 2.5))
    f = bpy.context.active_object
    f.data.energy = 500
    f.data.size = 4
    f.rotation_euler = (Vector((0, 0, 1.0)) - f.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(0, 3.0, 3.5))
    t = bpy.context.active_object
    t.data.energy = 450
    t.data.size = 4
    t.rotation_euler = (Vector((0, 0, 1.2)) - t.location).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("camera")
    cam = bpy.data.objects.new("camera", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cd.lens = 58
    alvo = Vector((0.1, 0.0, 0.9))
    cam.location = alvo + Vector((0, -7.2, 0.5))
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = saida
    bpy.ops.render.render(write_still=True)
    if os.environ.get("CLOSE"):  # closes para revisão: CLOSE=pai,menino (meio corpo de frente)
        scn.render.resolution_x, scn.render.resolution_y = 640, 640
        lens0, loc0, rot0 = cd.lens, cam.location.copy(), cam.rotation_euler.copy()
        for pedido in os.environ["CLOSE"].split(","):
            id_, _, parte = pedido.partition(":")  # parte: cabeca, tronco, quadril, perna (padrão: meio corpo)
            arm = P(id_)["arm"]
            pts = {"cabeca": ("Head", "Head", 1.0, 0.25), "tronco": ("Spine1", "Spine1", 1.0, 0.6), "ombro": ("Neck", "Neck", 1.0, 0.45),
                   "quadril": ("Hips", "Hips", 1.0, 0.6), "perna": ("LeftLeg", "RightLeg", 0.5, 0.8)}
            a_, b_, k_, dist = pts.get(parte, ("Spine1", "Head", 0.5, 1.0))
            alvo = (arm.matrix_world @ arm.pose.bones[a_].head).lerp(arm.matrix_world @ arm.pose.bones[b_].head, k_)
            if parte == "cabeca":
                alvo = alvo + Vector((0, 0, 0.08))
            cam.location = alvo + Vector((0.25, -2.6, 0.25)) * dist
            cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            cd.lens = 70
            scn.render.filepath = os.path.join(os.path.dirname(saida), f"close_{id_}_{parte or 'meio'}.png")
            bpy.ops.render.render(write_still=True)
        cd.lens, cam.location, cam.rotation_euler = lens0, loc0, rot0


if __name__ == "__main__":
    main()
