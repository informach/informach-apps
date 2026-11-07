"""Cena de exemplo da biblioteca: uma praça com gente fazendo coisas do dia a dia (29 pessoas), vista de cima, com uma
imagem de vitrine como norte. Tudo da biblioteca: corpos do arquivo-mestre (o mesmo corpo pode aparecer mais de uma
vez: a cena faz cópias), roupas e cabelos dos catálogos com cor livre, expressões, um quadro de uma animação da
biblioteca para cada pessoa e os objetos de mão do catálogo segurados como na página. O banco e o carrinho de bebê são
feitos aqui.

Uso: python cena_cidade.py -- <corpos.blend> <saida.png> [saida.blend] [--rapido]
"""
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import roupas as R  # noqa: E402
import cena_familia as CF  # noqa: E402
import props as PR  # noqa: E402

V = Vector
# corpo, animação (id da biblioteca, quadro), lugar (x, y, giro em graus: 0 = de frente para a câmera), cabelo, pelos,
# roupa [(id, cor)], tom de pele, expressão, segura: objeto de mão com a pose de segurar da página (ou uma pose própria)
PESSOAS = [
    # fundo
    dict(id="acena", corpo="adolescente_f", pose=("resident.wave", 20), lugar=(-3.7, 2.6, 15), expr="feliz",
         cabelo=("rabo_cavalo", "#2B1D16"),
         roupa=[("nov_acolchoada", "#F2A7C3"), ("nov_legging", "#2B2D33"), ("nov_luvas_justas", "#E8559A"),
                ("roupa_tenis_009", "#B8BEC6")]),
    dict(id="loiro", corpo="adulto", pose=("resident.walk.normal", 8), lugar=(-2.6, 2.3, 25),
         cabelo=("cabelo_xadrez1", "#E8C988"),
         roupa=[("nov_camisa_aberta", "#E04A3A"), ("nov_camiseta_justa", "#F2F2F2"), ("nov_calca_social", "#BFC3C9"),
                ("nov_oculos_sol_redondos", "#2B2B2B"), ("roupa_tenis_009", None)]),
    dict(id="careca", corpo="musculoso", pose=("resident.idle.neutral", 20), lugar=(-1.25, 3.1, 0),
         cabelo=None, pelos=["barba_2_curta"], cor_pelos="#3A2A20",
         roupa=[("nov_manga_longa", "#2FA84F"), ("nov_calca_jeans", "#4A6070"), ("roupa_sapato_seguranca", "#3A3D44")]),
    dict(id="colete", corpo="atletica", pose=("resident.walk.happy", 16), lugar=(-0.45, 2.55, -30),
         cabelo=("cabelo_showgirl", "#C8642F"),
         roupa=[("nov_camisa_social", "#F2F2F2"), ("var_colete_social", "#2B2D33"), ("nov_gravata", "#2F5FD0"),
                ("nov_calca_social", "#2B2D33"), ("nov_oculos_redondos", "#E8559A"), ("roupa_sapato_seguranca", None)]),
    dict(id="aponta", corpo="adulta", pose=("resident.point", 30), lugar=(0.65, 3.2, 10),
         cabelo=("coque", "#B5532A"),
         roupa=[("nov_polo", "#3DB4E0"), ("nov_calca_agasalho_listrada", "#2B2D33"), ("roupa_tenis_009", None)]),
    dict(id="regata", corpo="alto_magro", pose=("resident.walk.normal", 20), lugar=(1.75, 3.0, -15),
         cabelo=("cabelo_seguranca", "#7A5034"), pelos=["barba_rente"],
         roupa=[("nov_regata_justa", "#E8E8EA"), ("nov_short_curto", "#D9433B"), ("nov_meias_altas", "#F2F2F2"),
                ("roupa_tenis_009", "#3D7BD6")]),
    dict(id="mala", corpo="plus_m", pose=("resident.idle.neutral", 40), lugar=(2.6, 2.7, -10), tom="media",
         cabelo=("cabelo_seguranca", "#E8D9A8"),
         roupa=[("nov_camiseta_larga", "#F2F2F2"), ("nov_calca_social", "#5A4234"), ("roupa_sapato_seguranca", None),
                ("nov_mala_rodinha", "#5A5F66")],
         segura={"nov_mala_rodinha": {"alvo": [0.08, -0.86, 0.14], "eixos": {"x": [-0.45, -0.89, 0.05], "z": [0.0, 0.0, -1.0]}}}),
    # no banco
    dict(id="banco_chapeu", corpo="atletica", pose=("resident.sit.sofa.relaxed", 30), lugar=None, tom="escura",
         cabelo=("cabelo_caixa", "#1E1612"),
         roupa=[("nov_macacao", "#F2D23C"), ("nov_chapeu_praia", "#F2C231"), ("nov_oculos_sol_redondos", "#2B2B2B"),
                ("roupa_tenis_009", "#F2C231")]),
    dict(id="banco_ruivo", corpo="adolescente_m", pose=("resident.sit.sofa.relaxed", 30), lugar=None,
         cabelo=("cabelo_lenhador", "#E0662F"),
         roupa=[("nov_camisa_floral", "#F2D9C6"), ("nov_calca_social", "#F0A7B8"), ("nov_oculos_redondos", "#3D7BD6"),
                ("roupa_sapato_seguranca", "#2B2B2B")]),
    # meio
    dict(id="capitao", corpo="idoso", pose=("resident.idle.neutral", 30), lugar=(-3.85, 1.25, 20), cabeca_sobe=16,
         cabelo=("cabelo", "#E9E9E6"), pelos=["barba_2_curta"], cor_pelos="#E9E9E6",
         roupa=[("nov_camisa_social", "#F2F2F2"), ("nov_calca_listrada", "#3D7BD6"), ("nov_quepe_capitao", "#F2F2F2"),
                ("roupa_sapato_seguranca", "#2B2B2B")]),
    dict(id="bolsa_azul", corpo="adulta", pose=("resident.walk.normal", 12), lugar=(-2.75, 0.95, 30), tom="morena",
         cabelo=("coque", "#3A2216"),
         roupa=[("nov_camiseta_larga", "#F07AA6"), ("nov_short_curto", "#2B2D33"), ("nov_oculos_gatinho", "#E8559A"),
                ("roupa_tenis_plus", "#F07AA6"), ("nov_bolsa_academia", "#3DB4E0")], segura=["nov_bolsa_academia"]),
    dict(id="gatinho_celular", corpo="plus_f", pose=("resident.text", 30), lugar=(-1.7, 1.75, 10),
         cabelo=("cabelo_caixa_chapeu", "#3A2216"),
         roupa=[("nov_acolchoada", "#F2B8D0"), ("nov_calca_moletom", "#B23CC8"), ("nov_gatinho", "#F07AA6"),
                ("roupa_tenis_009", "#C8CDD3"), ("nov_celular", "#2B2B2B")]),
    dict(id="pequeno_pula", corpo="pequeno_m", pose=("resident.emote.excited", 25), lugar=(-0.85, 1.55, 15),
         expr="feliz", cabelo=("cabelo_seguranca", "#3A2A20"),
         roupa=[("nov_agasalho", "#F2C231"), ("nov_calca_moletom", "#3DB4E0"), ("roupa_tenis_plus", "#E8559A")]),
    dict(id="cafe", corpo="adolescente_m", pose=("resident.idle.neutral", 20), lugar=(0.05, 1.9, 10),
         cabelo=("cabelo_xadrez2", "#5A3A26"),
         roupa=[("nov_manga_longa", "#F2F2F2"), ("var_colete_acolchoado", "#8A8F96"), ("nov_calca_jeans", "#2F6FD0"),
                ("roupa_tenis_plus", "#D9433B"), ("nov_cafe", "#F2F2F2")], segura=["nov_cafe"]),
    dict(id="terno_maleta", corpo="adulto", pose=("resident.walk.normal", 4), lugar=(1.05, 1.8, -25),
         cabelo=("cabelo_seguranca_chapeu", "#3A2A20"), pelos=["barba_2_curta"], cor_pelos="#6B4A32", cabeca_sobe=16,
         roupa=[("nov_camisa_social", "#F2F2F2"), ("nov_paleto", "#2B2D33"), ("nov_calca_social", "#2B2D33"),
                ("nov_fedora", "#2B2D33"), ("roupa_sapato_seguranca", "#2B2B2B"), ("nov_pasta_couro", "#7A4B2D")],
         segura={"nov_pasta_couro": {"alvo": [0.06, -0.9, 0.24], "eixos": {"x": [0.0, -1.0, 0.0], "z": [0.0, 0.0, -1.0]}}}),
    dict(id="gatinho_acena", corpo="idosa", pose=("resident.wave", 26), lugar=(2.05, 1.55, -5), expr="feliz",
         cabelo=("cabelo_caixa_chapeu", "#4A3226"),
         roupa=[("nov_agasalho_listrado", "#7EC8F0"), ("nov_short_curto", "#3D8FE0"), ("nov_gatinho", "#F07AA6"),
                ("nov_meias_altas", "#F2C8D8"), ("roupa_tenis_009", "#3DB4E0")]),
    dict(id="bone_azul", corpo="crianca_m", pose=("resident.idle.happy", 30), lugar=(2.8, 1.9, -10),
         cabelo=("cabelo_seguranca_chapeu", "#5A3A26"),
         roupa=[("nov_camiseta_justa", "#C8D6E8"), ("nov_calca_jeans", "#5A7FA8"), ("nov_bone_novo", "#3D8FE0"),
                ("roupa_tenis_009", None)]),
    dict(id="selfie", corpo="alto_magro", pose=("resident.idle.happy", 30), lugar=(3.55, 1.6, -20), tom="morena",
         cabelo=("cabelo_plus", "#3A2A20"),
         roupa=[("nov_camisa_onca", "#E8559A"), ("nov_calca_boca_sino", "#B8237A"), ("nov_oculos_sol_redondos", "#3D7BD6"),
                ("roupa_sapato_36", "#C8963C"), ("nov_celular", "#2B2B2B")],
         # selfie: braço esticado para a frente e um pouco para cima e para fora, a tela virada para o rosto
         segura={"nov_celular": {"alvo": [0.62, 0.42, 0.12], "eixos": {"x": [0.0, 1.0, 0.0], "z": [-1.0, 0.0, -0.15]}}}),
    # frente
    dict(id="deitado", corpo="musculoso", pose=("resident.lie.idle", 60), lugar=(-3.5, -0.75, 35),
         cabelo=("cabelo_seguranca_chapeu", "#3A2A20"),
         roupa=[("nov_camiseta_justa", "#F2F2F2"), ("nov_jaqueta_aberta", "#8A4A2C"), ("nov_calca_social", "#6E737B"),
                ("nov_palheta", "#E8C9A8"), ("nov_oculos_sol_redondos", "#2B2B2B"), ("roupa_sapato_seguranca", "#3A2216")]),
    dict(id="balde_celular", corpo="adolescente_f", pose=("resident.text", 20), lugar=(-2.2, -0.3, 15), cabeca_sobe=30,
         cabelo=("cabelo_caixa_chapeu", "#2B1D16"),
         roupa=[("nov_agasalho_listrado", "#F2F2F2"), ("var_colete_acolchoado", "#3D7BD6"), ("nov_calca_jeans", "#3D7BD6"),
                ("nov_balde", "#F2F2F2"), ("roupa_tenis_009", "#3D7BD6"), ("nov_celular", "#2B2B2B")]),
    dict(id="loirinho", corpo="adolescente_m", pose=("resident.walk.happy", 20), lugar=(-0.9, -0.55, 10), expr="feliz",
         cabelo=("cabelo_xadrez1", "#F0D594"),
         roupa=[("nov_polo", "#5A5F66"), ("nov_short_curto", "#D9433B"), ("roupa_tenis_009", None)]),
    dict(id="telefone", corpo="adulto", pose=("resident.phone.talk", 30), lugar=(0.15, 0.4, 10),
         cabelo=("cabelo_xadrez2", "#6E6A66"),
         roupa=[("nov_camisa_social", "#F2F2F2"), ("nov_paleto", "#2B2D33"), ("nov_calca_social", "#2B2D33"),
                ("roupa_sapato_seguranca", "#2B2B2B"), ("nov_celular", "#E8559A")]),
    dict(id="sorvete", corpo="pequeno_m", pose=("resident.idle.happy", 30), lugar=(0.85, -0.55, 5), expr="feliz",
         cabelo=("cabelo_seguranca", "#2B1D16"),
         roupa=[("nov_manga_longa", "#8AB82F"), ("nov_calca_moletom", "#5A3A26"), ("roupa_tenis_009", None),
                ("nov_sorvete", "#F2E6D8")], segura=["nov_sorvete"]),
    dict(id="carrinho", corpo="adulta", pose=("resident.walk.normal", 4), lugar=(1.75, 0.1, 20),
         cabelo=("cabelo_caixa", "#2B2B2E"),
         roupa=[("nov_vestido_tubinho", "#F2F2F2"), ("nov_faixa_cintura", "#D9433B"), ("roupa_tenis_009", None)]),
    dict(id="bengala", corpo="idoso", pose=("resident.walk.old", 12), lugar=(3.45, -0.3, -20),
         cabelo=("cabelo", "#D6D6D2"),
         roupa=[("nov_camisa_social", "#2FA84F"), ("nov_calca_social", "#6B5242"), ("nov_suspensorio", "#5A3A26"),
                ("nov_gravata", "#D9433B"), ("roupa_chinelo_005", "#5A3A26"), ("nov_bengala", "#2E1E14")],
         segura={"nov_bengala": {"alvo": [0.32, -0.62, 0.3], "eixos": {"x": [0.08, -1.0, 0.06], "z": [0.0, 0.0, -1.0]},
                                 "vertical": True}}),
    dict(id="menina", corpo="crianca_f", pose=("resident.idle.happy", 30), lugar=(3.85, -0.55, -10), expr="feliz",
         cabelo=("cabelo_showgirl", "#8A4A2C"),
         roupa=[("nov_manga_longa", "#F07AA6"), ("nov_calca_jeans", "#3DC4D8"), ("roupa_tenis_plus", "#E8559A")]),
    dict(id="caveira", corpo="plus_m", pose=("resident.idle.neutral", 30), lugar=(4.25, 0.85, -15),
         cabelo=("cabelo_seguranca", "#6B4A32"), pelos=["bigode_2"],
         roupa=[("nov_camisa_caveira", "#2B2D33"), ("nov_calca_social", "#B8A890"), ("roupa_corrente_plus", None),
                ("nov_cinto_fivela", "#5A3A26"), ("roupa_sapato_seguranca", "#5A3A26")]),
    dict(id="sacola", corpo="plus_f", pose=("resident.walk.normal", 18), lugar=(5.1, 0.3, -25),
         cabelo=("coque", "#B5532A"),
         roupa=[("nov_camisa_uniforme", "#E8E85A"), ("nov_calca_agasalho_listrada", "#F0A7B8"),
                ("roupa_tenis_009", "#F29A22"), ("nov_bolsa_fecho", "#D9433B")], abre_bracos=14,
         segura={"nov_bolsa_fecho": {"alvo": [0.06, -0.88, 0.32], "eixos": {"x": [0.0, -1.0, 0.0], "z": [0.0, 0.0, -1.0]}}}),
    dict(id="chao", corpo="alto_magro", pose=("resident.sit.floor.crossed", 40), lugar=(4.4, -1.35, -35), tom="morena",
         cabelo=None,
         roupa=[("nov_camiseta_justa", "#8A6AD6"), ("nov_calca_moletom", "#8A8F96"), ("nov_touca", "#C8BCB0"),
                ("roupa_tenis_009", "#3D7BD6")]),
]
BANCO = (4.0, 3.75, -12)  # x, y, giro
BEBE = "recem_f"  # o recém-nascido deitado no carrinho


# ------------------------------------------------------------------ cópias de corpos
def duplica_corpos(pessoas):
    """Cada corpo usado mais de uma vez ganha cópias (esqueleto, corpo, rostos, cabelos e pelos do mestre), com o nome
    <corpo>__<n>; a pessoa passa a usar a cópia."""
    vistos = {}
    for p in pessoas:
        c = p["corpo"]
        n = vistos.get(c, 0)
        vistos[c] = n + 1
        if n == 0:
            continue
        novo = f"{c}__{n + 1}"
        arm0 = bpy.data.objects[c]
        lug = arm0.parent.copy()
        lug.name = novo + "_lugar"
        bpy.context.scene.collection.objects.link(lug)
        arm = arm0.copy()
        arm.data = arm0.data.copy()
        arm.name = novo
        bpy.context.scene.collection.objects.link(arm)
        arm.parent = lug
        for o in [o for o in bpy.data.objects if o.parent is arm0 and o.type == "MESH" and o.name.startswith(c + "_")]:
            o2 = o.copy()
            o2.data = o.data.copy()
            o2.name = novo + o.name[len(c):]
            bpy.context.scene.collection.objects.link(o2)
            o2.parent = arm
            for m in o2.modifiers:
                if m.type == "ARMATURE":
                    m.object = arm
        p["corpo"] = novo


# ------------------------------------------------------------------ segurar objetos como na página
def referencial_corpo(arm, lado):
    o = lambda n: CF.osso(arm, n)  # noqa: E731
    up = (o("Neck") - o("Hips")).normalized()
    dir_lado = (o("RightArm") - o("LeftArm")).normalized()
    frente = up.cross(dir_lado).normalized()
    fora = dir_lado if lado == "dir" else -dir_lado
    return frente, up, fora


def ponta_no_chao(p, rid):
    """Objeto de mão mais comprido que a altura da mão (bengala): encolhe em volta da mão até a ponta encostar no chão."""
    o = bpy.data.objects[p["corpo"] + "_" + rid]
    item = R.ITENS[rid]
    mao = CF.osso(p["arm"], ("Left" if item.get("mao") == "esq" else "Right") + "Hand")
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    zmin = min((ev.matrix_world @ v.co).z for v in ev.data.vertices)
    apoia = "bengala" in rid or "mala_rodinha" in rid  # estes encostam no chão também se forem curtos
    if zmin >= 0.005 and not apoia:
        return
    k = (mao.z - 0.005) / max(mao.z - zmin, 1e-3)
    # a peça está presa à mão pelo esqueleto: a escala vai na malha de descanso, em volta do ponto de descanso da mão
    arm = p["arm"]
    pb = arm.pose.bones[("Left" if item.get("mao") == "esq" else "Right") + "Hand"]
    M = arm.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted() @ arm.matrix_world.inverted()  # descanso → pose
    Mi = M.inverted()
    mao_rest = o.matrix_world.inverted() @ (Mi @ mao)
    for v in o.data.vertices:
        v.co = mao_rest + (v.co - mao_rest) * k
    o.data.update()
    print("ponta no chão", p["id"], rid, round(k, 2), flush=True)


def segura(p, rid, pose=None):
    """A pose de segurar do catálogo ("pose" do item, a mesma da página): o braço daquele lado vai até o alvo (frente,
    cima e fora do ombro, em comprimentos de braço) por IK e a mão gira pelos eixos ("eixos" x/z ou y/z, ou "aponta")."""
    item = R.ITENS[rid]
    ps = pose or item.get("pose")
    if not ps:
        return
    arm = p["arm"]
    lado = item.get("mao", "dir")
    L = "Left" if lado == "esq" else "Right"
    frente, up, fora = referencial_corpo(arm, lado)
    if ps.get("vertical"):  # bengala: a vertical do mundo (com o corpo inclinado, a da coluna punha a ponta para trás)
        up = V((0, 0, 1))
        frente = V((frente.x, frente.y, 0)).normalized()
        fora = V((fora.x, fora.y, 0))
        fora = (fora - frente * fora.dot(frente)).normalized()
    corpoV = lambda v: (frente * v[0] + up * v[1] + fora * v[2])  # noqa: E731
    S = CF.osso(arm, L + "Arm")
    Lb = (CF.osso(arm, L + "ForeArm") - S).length + (CF.osso(arm, L + "Hand") - CF.osso(arm, L + "ForeArm")).length
    f, a, l = ps["alvo"]
    T = S + corpoV((f, a, l)) * Lb
    polo = S + corpoV((-0.2, -0.6, 0.7))
    CF.ik_braco(arm, lado, T, polo)
    if os.environ.get("DIAG"):
        print("DIAG segura", p["id"], rid, "ombro", [round(x, 2) for x in S], "alvo", [round(x, 2) for x in T],
              "mao", [round(x, 2) for x in CF.osso(arm, L + "Hand")], "frente", [round(x, 2) for x in frente], flush=True)
    ex = ps.get("eixos")
    if ex and ex.get("y") is not None:
        Yd = corpoV(ex["y"]).normalized()
        Zd = corpoV(ex["z"])
        Zd = (Zd - Yd * Zd.dot(Yd)).normalized()
        Xd = Yd.cross(Zd).normalized()
    elif ex:
        Xd = corpoV(ex["x"]).normalized()
        Zd = corpoV(ex["z"])
    elif ps.get("aponta"):
        Yd = corpoV(ps["aponta"]).normalized()
        Xd = frente - Yd * frente.dot(Yd)
        if Xd.length < 1e-3:
            Xd = up.copy()
        Xd.normalize()
        Zd = Xd.cross(Yd)
    else:
        return
    CF.orienta_mao(arm, lado, Xd, Zd)
    CF.fecha_dedos(arm, lado, 0.85, 0.45)


# ------------------------------------------------------------------ banco e carrinho
def _material(nome, hexa, rug=0.6, metal=0.0):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*CF._rgb(hexa), 1)
    b.inputs["Roughness"].default_value = rug
    b.inputs["Metallic"].default_value = metal
    return m


def _caixa(bm, c, t, rot_z=0.0):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:
        q = V((v.co.x * t[0], v.co.y * t[1], v.co.z * t[2]))
        q.rotate(Matrix.Rotation(rot_z, 3, "Z"))
        v.co = V(c) + q
    eds = list({e for v in r["verts"] for e in v.link_edges})
    bmesh.ops.bevel(bm, geom=list(r["verts"]) + eds, offset=min(t) * 0.18, segments=2, affect="EDGES")


def _objeto(nome, bm, mat, liso=True):
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = liso
    me.materials.append(mat)
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def banco(x, y, giro):
    """Banco de praça: assento e encosto de ripas de madeira sobre dois pés de ferro (assento a 45 cm)."""
    raiz = bpy.data.objects.new("banco", None)
    bpy.context.scene.collection.objects.link(raiz)
    bm = bmesh.new()
    larg = 2.0
    for k in range(4):  # assento
        _caixa(bm, (0, -0.2 + k * 0.13, 0.45), (larg, 0.11, 0.035))
    for k in range(3):  # encosto, inclinado para trás
        z = 0.6 + k * 0.13
        _caixa(bm, (0, 0.26 + (z - 0.6) * 0.25, z), (larg, 0.035, 0.1))
    madeira = _objeto("banco_madeira", bm, _material("banco_madeira", "#8A5232", 0.7))
    bm = bmesh.new()
    for sx in (-0.82, 0.82):  # pés: perna da frente, de trás e o braço do encosto
        _caixa(bm, (sx, -0.22, 0.21), (0.05, 0.05, 0.43))
        _caixa(bm, (sx, 0.22, 0.22), (0.05, 0.05, 0.45))
        _caixa(bm, (sx, 0.0, 0.42), (0.05, 0.5, 0.04))
        _caixa(bm, (sx, 0.29, 0.68), (0.05, 0.04, 0.5), rot_z=0.0)
        _caixa(bm, (sx, -0.05, 0.64), (0.05, 0.4, 0.04))
    ferro = _objeto("banco_ferro", bm, _material("banco_ferro", "#3A3D44", 0.4, 0.6))
    for o in (madeira, ferro):
        o.parent = raiz
    raiz.location = (x, y, 0)
    raiz.rotation_euler.z = math.radians(giro)
    bpy.context.view_layer.update()
    return raiz, 0.45 + 0.035 / 2


def carrinho(alca_esq, alca_dir, frente):
    """Carrinho de bebê: alça na altura das mãos, cesto rosa com borda verde-água, capota, armação e quatro rodas."""
    import numpy as np
    bm_ar = bmesh.new()
    meio = (alca_esq + alca_dir) / 2
    lado = (alca_dir - alca_esq)
    lado.z = 0
    larg = max(lado.length, 0.36)
    lado.normalize()
    fr = V((frente.x, frente.y, 0)).normalized()
    up = V((0, 0, 1))

    def P(f, s, z):  # frente, lado, altura absoluta
        q = meio + fr * f + lado * s
        q.z = z
        return q

    def tubo(a, b, r=0.014):
        d = b - a
        L = d.length
        r_ = bmesh.ops.create_cone(bm_ar, cap_ends=True, segments=8, radius1=r, radius2=r, depth=L)
        rot = V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        for v in r_["verts"]:
            v.co = (a + b) / 2 + (rot @ v.co.to_4d()).to_3d()
    h = meio.z
    tubo(P(0, -larg / 2, h), P(0, larg / 2, h), 0.018)  # alça
    for s in (-1, 1):
        tubo(P(0, s * larg / 2, h), P(0.42, s * 0.2, 0.42))  # da alça até o cesto
        tubo(P(0.42, s * 0.2, 0.42), P(0.12, s * 0.22, 0.12))  # perna de trás
        tubo(P(0.42, s * 0.2, 0.42), P(0.78, s * 0.2, 0.12))  # perna da frente
    armacao = _objeto("carrinho_armacao", bm_ar, _material("carrinho_armacao", "#3E5A72", 0.4, 0.5))
    bm = bmesh.new()
    for f_, s_ in ((0.12, -0.22), (0.12, 0.22), (0.78, -0.2), (0.78, 0.2)):
        r_ = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.09, radius2=0.09, depth=0.035)
        for v in r_["verts"]:
            q = V((v.co.x, v.co.z, v.co.y))  # eixo da roda na lateral
            q = V((q.x, q.y, q.z))
            v.co = P(f_, s_, 0.09) + fr * q.x + lado * q.y + up * q.z
    rodas = _objeto("carrinho_rodas", bm, _material("carrinho_rodas", "#2B2D33", 0.8))
    bm = bmesh.new()  # cesto: meia elipsoide
    r_ = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for v in r_["verts"]:
        x, y, z = v.co
        z = min(z, 0.35)
        v.co = P(0.5 + x * 0.33, y * 0.24, 0.62 + z * 0.24)
    cesto = _objeto("carrinho_cesto", bm, _material("carrinho_cesto", "#F07AB0", 0.55))
    bm = bmesh.new()  # borda
    r_ = bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=1.0, radius2=1.0, depth=0.07)
    for v in r_["verts"]:
        v.co = P(0.5 + v.co.x * 0.345, v.co.y * 0.255, 0.68 + v.co.z)
    borda = _objeto("carrinho_borda", bm, _material("carrinho_borda", "#3FC1C9", 0.5))
    bm = bmesh.new()  # capota: um quarto de esfera para trás
    r_ = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    vs = r_["verts"]
    for v in vs:
        x, y, z = v.co
        z = max(z, 0.0)
        x = min(x, 0.15)
        v.co = P(0.48 + x * 0.3, y * 0.25, 0.7 + z * 0.3)
    capota = _objeto("carrinho_capota", bm, _material("carrinho_cesto", "#F07AB0", 0.55))
    return [armacao, rodas, cesto, borda, capota]


# ------------------------------------------------------------------ montagem
def sentar_no_banco(p, raiz, assento_z, desloc_x):
    """Põe quem está sentado no banco: o quadril um pouco à frente do encosto e o fundo das nádegas no assento."""
    arm = p["arm"]
    lug = arm.parent
    lug.rotation_euler = (0, 0, raiz.rotation_euler.z)
    bpy.context.view_layer.update()
    alvo = raiz.matrix_world @ V((desloc_x, 0.02, 0))
    h = CF.osso(arm, "Hips")
    lug.location.x += alvo.x - h.x
    lug.location.y += alvo.y - h.y
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    corpo = bpy.data.objects[p["corpo"] + "_corpo"].evaluated_get(dg)
    h = CF.osso(arm, "Hips")
    zs = [(corpo.matrix_world @ v.co).z for v in corpo.data.vertices
          if abs((corpo.matrix_world @ v.co).z - h.z) < 0.22 and ((corpo.matrix_world @ v.co).xy - h.xy).length < 0.2]
    lug.location.z += assento_z - min(zs)
    bpy.context.view_layer.update()


def reclina(p, graus=42):
    """Deitado de costas, apoiado nos braços: o tronco sobe (a coluna gira em volta do eixo lateral) e as mãos vão ao
    chão, atrás e ao lado do quadril."""
    arm = p["arm"]
    hips, neck = CF.osso(arm, "Hips"), CF.osso(arm, "Neck")
    v = (neck - hips)
    eixo = v.cross(V((0, 0, 1))).normalized()
    R3 = arm.matrix_world.to_3x3().normalized()
    from mathutils import Quaternion
    for nome, frac in (("Spine", 0.6), ("Spine1", 0.4)):
        e_a = (R3.inverted() @ eixo).normalized()
        CF.gira_osso(arm, arm.pose.bones[nome], Quaternion(e_a, math.radians(graus * frac)))
    # as pernas fecham um pouco (35% menos abertas): muito abertas, as coxas cruzavam o pano da calça no gancho
    lat = (CF.osso(arm, "LeftUpLeg") - CF.osso(arm, "RightUpLeg")).normalized()
    for nome, joelho in (("LeftUpLeg", "LeftLeg"), ("RightUpLeg", "RightLeg")):
        v0 = CF.osso(arm, joelho) - CF.osso(arm, nome)
        v1 = v0 - lat * v0.dot(lat) * 0.35
        q = v0.rotation_difference(v1)
        CF.gira_osso(arm, arm.pose.bones[nome], Quaternion((R3.inverted() @ q.axis).normalized(), q.angle))
    hb = arm.pose.bones["Head"]  # a cabeça olha para a frente (desfaz parte do giro)
    CF.gira_osso(arm, hb, Quaternion((R3.inverted() @ eixo).normalized(), math.radians(-graus * 0.35)))
    hips = CF.osso(arm, "Hips")
    dir_t = (CF.osso(arm, "Neck") - hips)
    dir_t.z = 0
    dir_t.normalize()
    lat = dir_t.cross(V((0, 0, 1))).normalized()
    for lado in ("esq", "dir"):
        L = "Left" if lado == "esq" else "Right"
        s = 1 if (CF.osso(arm, L + "Arm") - hips).dot(lat) > 0 else -1
        alvo = hips + lat * s * 0.24 + dir_t * 0.02
        alvo.z = 0.06
        CF.ik_braco(arm, lado, alvo, CF.osso(arm, L + "Arm") + lat * s * 0.3 - dir_t * 0.3)
        CF.orienta_mao(arm, lado, lat * s * 0.3 - dir_t * 0.9, V((0, 0, -1)))
    bpy.context.view_layer.update()


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    blend, saida = a[0], a[1]
    salva = a[2] if len(a) > 2 and not a[2].startswith("--") else None
    rapido = "--rapido" in a
    bpy.ops.wm.open_mainfile(filepath=blend)
    CF.acha_texturas()
    usados = {p["corpo"] for p in PESSOAS} | {BEBE}
    for o in list(bpy.data.objects):  # só os corpos da cena
        dono = next((c for c in usados if o.name == c or o.name.startswith(c + "_")), None)
        if o.type in ("LIGHT", "CAMERA") or (dono is None and o.type in ("MESH", "ARMATURE", "EMPTY")):
            bpy.data.objects.remove(o, do_unlink=True)
    duplica_corpos(PESSOAS)
    raiz_banco, assento = banco(BANCO[0] * 0.85, BANCO[1], BANCO[2])
    for p in PESSOAS:
        lugar = p.pop("lugar")
        p["lugar"] = None
        CF.monta_pessoa(p)
        p["lugar"] = lugar
        arm = p["arm"]
        if lugar:
            x, y, g = lugar
            arm.parent.location = (x * 0.85, y, 0)
            arm.parent.rotation_euler = (0, 0, math.radians(g))
            bpy.context.view_layer.update()
            CF.no_chao(arm, [m for m in p["malhas"] if m.name.endswith("_corpo")])
    from mathutils import Quaternion
    for p in PESSOAS:  # corpos largos: os braços abrem um pouco (senão a mão entra na barriga)
        if p.get("abre_bracos"):
            arm = p["arm"]
            R3 = arm.matrix_world.to_3x3().normalized()
            fr_ = (R3.inverted() @ (arm.parent.matrix_world.to_3x3() @ V((0, -1, 0)))).normalized()
            lx = arm.parent.matrix_world.to_3x3() @ V((1, 0, 0))  # o lado +x da pessoa (ela olha para -y)
            for nome in ("LeftArm", "RightArm"):
                s = 1 if (CF.osso(arm, nome) - CF.osso(arm, "Spine1")).dot(lx) > 0 else -1
                # giro em volta da frente: positivo levanta o braço do lado +x (para fora)
                CF.gira_osso(arm, arm.pose.bones[nome], Quaternion(fr_, math.radians(p["abre_bracos"]) * s))
    for p in PESSOAS:  # quem olha o celular levanta um pouco a cabeça (de cima, o chapéu escondia o rosto)
        if p.get("cabeca_sobe"):
            arm = p["arm"]
            R3 = arm.matrix_world.to_3x3().normalized()
            lado = (R3.inverted() @ (arm.parent.matrix_world.to_3x3() @ V((1, 0, 0)))).normalized()
            for nome, fr in (("Neck", 0.35), ("Head", 0.65)):
                CF.gira_osso(arm, arm.pose.bones[nome], Quaternion(lado, -math.radians(p["cabeca_sobe"] * fr)))
    pd = next(p for p in PESSOAS if p["id"] == "deitado")
    reclina(pd, 58)
    CF.no_chao(pd["arm"], [m for m in pd["malhas"] if m.name.endswith("_corpo")])
    sentar_no_banco(next(p for p in PESSOAS if p["id"] == "banco_chapeu"), raiz_banco, assento, -0.45)
    sentar_no_banco(next(p for p in PESSOAS if p["id"] == "banco_ruivo"), raiz_banco, assento, 0.42)
    for p in PESSOAS:  # deitado e sentados: o gancho da calça alisado já na pose
        if any(k in p["pose"][0] for k in (".lie", ".sit")) and os.environ.get("ALISA"):
            CF.alisa_fundilho_posado(p)
    for p in PESSOAS:  # objetos de mão segurados como na página
        seg = p.get("segura") or []
        for rid in seg:
            segura(p, rid, seg[rid] if isinstance(seg, dict) else None)
            ponta_no_chao(p, rid)  # bengala e mala mais compridas que a altura da mão
    if os.environ.get("DIAG"):
        dg = bpy.context.evaluated_depsgraph_get()
        for p in PESSOAS:
            for rid, _ in p["roupa"]:
                if R.ITENS[rid].get("tipo") == "mao":
                    o = bpy.data.objects[p["corpo"] + "_" + rid].evaluated_get(dg)
                    ps = [o.matrix_world @ v.co for v in o.data.vertices]
                    print("DIAG", p["id"], rid, [round(min(q[i] for q in ps), 2) for i in range(3)], [round(max(q[i] for q in ps), 2) for i in range(3)],
                          "mão", [round(x, 2) for x in CF.osso(p["arm"], ("Left" if R.ITENS[rid].get("mao") == "esq" else "Right") + "Hand")], flush=True)
    # o carrinho: alça nas duas mãos de quem empurra
    pc = next(p for p in PESSOAS if p["id"] == "carrinho")
    arm = pc["arm"]
    fr, up, dl = referencial_corpo(arm, "dir")
    h = CF.osso(arm, "Hips")
    alca = h + fr * 0.42 + V((0, 0, 0.12))
    for lado, s in (("esq", -1), ("dir", 1)):
        L = "Left" if lado == "esq" else "Right"
        alvo = alca + dl * s * 0.19
        CF.ik_braco(arm, lado, alvo - fr * 0.03, CF.osso(arm, L + "Arm") + dl * s * 0.4 - up * 0.4)
        CF.orienta_mao(arm, lado, fr * 0.6 - up * 0.2 - dl * s * 0.3, -up)
        CF.fecha_dedos(arm, lado, 0.8, 0.4)
    _, berco = PR.carrinho_bebe(alca - dl * 0.21, alca + dl * 0.21, fr)
    PR.deita_recem(BEBE, berco)
    CF.acha_texturas()
    estudio(saida, rapido)
    CF.R.limpa_fontes()
    if salva:
        bpy.ops.wm.save_as_mainfile(filepath=salva, compress=True)
    print("fim")


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
    w.node_tree.nodes["Background"].inputs[0].default_value = (*CF._rgb("#1B1D2B"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=80)
    chao = bpy.context.active_object
    chao.data.materials.append(_material("chao", "#1D1F2D", 0.95))
    bpy.ops.object.light_add(type="AREA", location=(-4.0, -6.0, 8.0))
    k = bpy.context.active_object
    k.data.energy = 4500
    k.data.size = 8
    k.rotation_euler = (V((0.5, 1.2, 0)) - k.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(6.0, -3.0, 5.0))
    f = bpy.context.active_object
    f.data.energy = 1200
    f.data.size = 6
    f.rotation_euler = (V((0.5, 1.2, 0)) - f.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(0.5, 7.0, 6.0))
    t = bpy.context.active_object
    t.data.energy = 1500
    t.data.size = 6
    t.rotation_euler = (V((0.5, 1.2, 0.8)) - t.location).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("camera")
    cam = bpy.data.objects.new("camera", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cd.lens = 47
    alvo = V((0.35, 1.3, 0.62))
    cam.location = alvo + V((0, -11.3, 6.2))  # perto o bastante para a multidão encher o quadro, como na imagem-norte
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = saida
    bpy.ops.render.render(write_still=True)
    if os.environ.get("CLOSE"):  # closes para revisão: CLOSE=selfie,carrinho
        scn.render.resolution_x, scn.render.resolution_y = 640, 640
        for id_ in os.environ["CLOSE"].split(","):
            arm = next(p for p in PESSOAS if p["id"] == id_)["arm"]
            alvo = CF.osso(arm, "Hips").lerp(CF.osso(arm, "Head"), 0.4)
            cam.location = alvo + V((0.6, -3.2, 1.8))
            cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            cd.lens = 60
            scn.render.filepath = os.path.join(os.path.dirname(saida), f"close_{id_}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
