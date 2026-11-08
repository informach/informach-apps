"""Miniaturas do Elenco: cada personagem de elenco.json renderizado de corpo inteiro, três quartos de frente, fundo
transparente, 256 × 256 (PNG; elenco_folhas.py converte para WebP e monta folhas e sprite).

Monta as pessoas como as cenas da biblioteca (cena_familia.py / cena_cidade.py): corpo do arquivo-mestre, peças do
catálogo encaixadas por roupas.veste (com os pesos da pele, folga e pele coberta), cor livre pelas máscaras, cabelo
e barba do catálogo com cor lisa, tom de pele, expressão, um quadro de uma animação da biblioteca e o objeto de mão
segurado como na página. Para não recarregar tudo, o arquivo-mestre abre uma vez, cada peça é encaixada uma vez por
corpo (guardada escondida) e cada personagem usa cópias dela.

Uso: python elenco_render.py -- <corpos.blend> <elenco.json> <saida_dir> [--corpos a,b] [--ids x,y] [--refaz]
Variáveis: AMOSTRAS (padrão 12), RES (padrão 256), THREADS (padrão 1).
"""
import math
import os
import sys
import time

import bpy
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import roupas as R  # noqa: E402
import cabelos as CAB  # noqa: E402
import cena_familia as CF  # noqa: E402
import cena_cidade as CC  # noqa: E402
import json  # noqa: E402

PACOTES = CF.PACOTES
BIB = CF.BIB
GEMEO = {"adulta": "adulto", "idosa": "idoso", "adolescente_f": "adolescente_m", "crianca_f": "crianca_m",
         "pequena_f": "pequeno_m", "bebe_f": "bebe_m"}
TONS = {"Clara": "#FFB69F", "Média": "#FEA679", "Morena": "#BA6953", "Escura": "#482B25"}
REF = "#FB9D72"  # como a página: pele = textura × (tom ÷ esta cor)
CABELO_CORES = {"Castanho claro": "#976858", "Castanho": "#5a3f33", "Preto": "#262322", "Loiro": "#d2a66a",
                "Ruivo": "#a9532f", "Grisalho": "#b5b0a8"}
MANTA_CORES = {"Creme": "#f6efe2", "Branco": "#fbfbf8", "Rosa-bebê": "#f4cfd6", "Azul-bebê": "#c9dcf0",
               "Verde-água": "#c4e4dc", "Amarelo-claro": "#f5e7b8", "Cinza": "#cfcfcf"}
# pose da miniatura: a animação sugerida quando a biblioteca de poses do Blender a tem; senão a de repouso
POSE_PADRAO = {"bebe_m": ("resident.baby.sit", 20)}
QUADRO = {"resident.idle.neutral": 30, "resident.idle.happy": 30, "resident.idle.old": 30, "resident.idle.bored": 30,
          "resident.idle.look_around": 12, "resident.baby.sit": 20, "resident.talk.listen": 20}
MINI_POSES = set(QUADRO)


_IDX = {}


def acha_texturas():
    """Como cena_familia.acha_texturas, com o índice das imagens dos pacotes feito uma vez só."""
    if not _IDX:
        for raiz, _, arqs in os.walk(PACOTES):
            for f in arqs:
                if f.lower().endswith((".png", ".jpg", ".jpeg")):
                    _IDX.setdefault(f, []).append(os.path.join(raiz, f))
        for extra in ("roupas_gen", "roupas_mascaras"):
            pasta = os.path.join(AQUI, "biblioteca", extra)
            for f in os.listdir(pasta) if os.path.isdir(pasta) else []:
                _IDX.setdefault(f, []).append(os.path.join(pasta, f))
    for im in bpy.data.images:
        if not im.filepath or im.packed_file or os.path.exists(bpy.path.abspath(im.filepath)):
            continue
        fp = im.filepath.replace("\\", "/")
        nome = os.path.basename(fp)
        pacote = fp.split("ideias/")[1].split("/")[0] if "ideias/" in fp else None
        cands = _IDX.get(nome, [])
        if pacote:
            cands = [c for c in cands if f"/{pacote}/" in c] or cands
        if cands:
            cands = sorted(cands, key=lambda c: ("textur" not in c.lower(), len(c)))
            im.filepath = cands[0]
            im.reload()


def hexa(v, tabela, padrao):
    if isinstance(v, str) and v.startswith("#") and len(v) == 7:
        return v
    return tabela.get(v, padrao)


def lin(h):
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))


# ------------------------------------------------------------------ cache de ações (poses)
_ACOES = {}


def acao(fonte, nome):
    k = (fonte, nome)
    if k not in _ACOES:
        with bpy.data.libraries.load(os.path.join(BIB, fonte + ".blend"), link=False) as (src, dst):
            dst.actions = [nome] if nome in src.actions else []
        _ACOES[k] = dst.actions[0] if dst.actions else None
        if _ACOES[k] is not None:
            _ACOES[k].use_fake_user = True
    return _ACOES[k]


def pose(arm, corpo, nome, quadro):
    fonte = GEMEO.get(corpo, corpo)
    act = acao(fonte, nome)
    if act is None:
        print("sem ação", fonte, nome, flush=True)
        return False
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if act.slots:
        ad.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    bpy.context.scene.frame_set(int(min(max(quadro, f0), f1)))
    bpy.context.view_layer.update()
    mats = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
    ad.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    for pb in sorted(arm.pose.bones, key=lambda p: len(p.parent_recursive)):
        pb.matrix = mats[pb.name]
        bpy.context.view_layer.update()
    return True


def repouso(arm):
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
        pb.rotation_mode = "QUATERNION"
    bpy.context.view_layer.update()


# ------------------------------------------------------------------ peças encaixadas uma vez por corpo
_PECAS = {}   # (corpo, rid) -> objeto escondido, já com os pesos
_CABELOS = {}  # (corpo, id) -> objeto escondido


def guarda(ob):
    ob.hide_render = ob.hide_viewport = True
    return ob


def copia(ob, nome):
    o2 = ob.copy()
    o2.data = ob.data.copy()
    o2.name = nome
    for col in ob.users_collection:
        col.objects.link(o2)
        break
    else:
        bpy.context.scene.collection.objects.link(o2)
    o2.hide_render = o2.hide_viewport = False
    return o2


def peca_base(c, rid):
    k = (c, rid)
    if k in _PECAS:
        return _PECAS[k]
    arm = bpy.data.objects[c]
    corpo = bpy.data.objects[c + "_corpo"]
    item = R.ITENS[rid]
    repouso(arm)
    try:
        ob = R.veste(item, arm, corpo, PACOTES)
    except Exception as e:  # noqa: BLE001
        print("falhou", c, rid, repr(e), flush=True)
        _PECAS[k] = None
        return None
    ob.name = f"{c}__base__{rid}"
    if not any(m.type == "ARMATURE" for m in ob.modifiers):  # chapéu e óculos: presos ao osso da cabeça
        g = ob.vertex_groups.new(name="Head")
        g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
        ob.modifiers.new("Esqueleto", "ARMATURE").object = arm
    elif item.get("tipo") == "pele" or item.get("compoe") or R._resolve(item).get("tipo") == "pele":
        CF.pesos_da_pele(ob, corpo, manter_saia=True)
        slot_ = R._resolve(item).get("slot")
        if slot_ in ("cima", "sobre"):
            CF.sem_pernas(ob)
        if slot_ in ("baixo", "inteira"):
            CF.pernas_do_lado(ob)
        if slot_ in ("cima", "baixo", "inteira", "sobre"):
            CF.folga_extra(ob, 0.004 if slot_ == "sobre" else 0.0025)
    _PECAS[k] = guarda(ob)
    return ob


def cabelo_base(c, cid):
    k = (c, cid)
    if k in _CABELOS:
        return _CABELOS[k]
    arm = bpy.data.objects[c]
    corpo = bpy.data.objects[c + "_corpo"]
    nome = c + "_cabelo" if cid == "cabelo" else c + "_" + cid
    ob = bpy.data.objects.get(nome)
    if ob is None and cid in CAB.ITENS:
        repouso(arm)
        try:
            ob = CAB.encaixa(CAB.ITENS[cid], arm, corpo, PACOTES)
            ob.name = nome
        except Exception as e:  # noqa: BLE001
            print("cabelo falhou", c, cid, repr(e), flush=True)
            ob = None
    _CABELOS[k] = guarda(ob) if ob is not None else None
    return _CABELOS[k]


# ------------------------------------------------------------------ materiais
def cor_lisa(ob, cor_hex, rug=0.7):
    m = bpy.data.materials.new(ob.name + "_cor")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*lin(cor_hex), 1)
    b.inputs["Roughness"].default_value = rug
    ob.data.materials.clear()
    ob.data.materials.append(m)


def tom_de_pele(ob, cor_hex, guardados):
    """Pele: a textura × (tom ÷ cor de referência), como a página. Guarda os materiais originais para voltar."""
    alvo, base = lin(cor_hex), lin(REF)
    k = [min(a / b, 4.0) for a, b in zip(alvo, base)]
    guardados.append((ob, list(ob.data.materials)))
    for i, m in enumerate(ob.data.materials):
        if not m or not m.node_tree:
            continue
        m2 = m.copy()
        ob.data.materials[i] = m2
        nt = m2.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
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


_COBRE = {}


def mascara_minima(arq):
    """Saias geradas: a cor é lisa, num ponto só da paleta, e a máscara cobre poucos pixels (a interpolação do Blender
    quase não acha). Nesses casos a cor vai direto no material."""
    if arq not in _COBRE:
        try:
            from PIL import Image
            import numpy as np
            a = np.asarray(Image.open(os.path.join(R.PASTA_MASC, arq)).convert("L"))
            _COBRE[arq] = (a > 127).mean() < 0.002
        except Exception:  # noqa: BLE001
            _COBRE[arq] = False
    return _COBRE[arq]


def tinge(ob, rid, cor_hex):
    """Cor livre como cena_familia.tinge; o material sem textura (cor lisa, como as saias geradas) recebe a cor direto."""
    if not cor_hex:
        return
    info = R.MASCARAS.get(rid, {})
    lisos = {k for k, m in enumerate(ob.data.materials) if m and m.node_tree and m.name.split(".")[0] in info
             and (not any(nd.type == "TEX_IMAGE" for nd in m.node_tree.nodes)
                  or (rid.startswith("gen_") and mascara_minima(info[m.name.split(".")[0]]["mascara"])))}
    CF.tinge(ob, rid, cor_hex)
    for k, m in enumerate(ob.data.materials):
        if k in lisos:
            m2 = m.copy()
            ob.data.materials[k] = m2
            b = next((nd for nd in m2.node_tree.nodes if nd.type == "BSDF_PRINCIPLED"), None)
            if b is not None:
                for lk in list(b.inputs["Base Color"].links):
                    m2.node_tree.links.remove(lk)
                b.inputs["Base Color"].default_value = (*lin(cor_hex), 1)


# ------------------------------------------------------------------ montagem de um personagem
def sem_pai_corpo(c):
    """Objetos do corpo vindos do mestre (rostos, cabelos, barbas, manta...), escondidos."""
    return [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(c + "_") and "__" not in o.name
            and o.name != c + "_corpo"]


def monta(p):
    c = p["corpo"]
    arm = bpy.data.objects[c]
    corpo = bpy.data.objects[c + "_corpo"]
    lug = arm.parent
    lug.matrix_world = Matrix.Identity(4)
    repouso(arm)
    for o in sem_pai_corpo(c):
        o.hide_render = o.hide_viewport = True
    corpo.hide_render = corpo.hide_viewport = False
    criados, guardados = [], []
    malhas = [corpo]
    expr = p.get("expressao") or "neutro"
    rosto = bpy.data.objects.get(f"{c}_rosto_{expr}") or bpy.data.objects.get(f"{c}_rosto_neutro")
    if rosto:
        rosto.hide_render = rosto.hide_viewport = False
        malhas.append(rosto)
    pele = hexa(p.get("pele"), TONS, TONS["Média"])
    tom_de_pele(corpo, pele, guardados)
    if rosto:
        tom_de_pele(rosto, pele, guardados)
    recem = c.startswith("recem")
    cab = p.get("cabelo") or {}
    if recem:
        tipo = cab.get("tipo", "baixinho")
        cor = hexa(cab.get("cor"), CABELO_CORES, "#976858")
        for parte, mostra in (("manta", True), ("chupeta", bool(p.get("chupeta"))), ("gorro", tipo == "gorro"),
                              ("cabelo", tipo == "baixinho")):
            o = bpy.data.objects.get(f"{c}_{parte}")
            if o is None or not mostra:
                continue
            o2 = copia(o, f"{c}__x__{parte}")
            criados.append(o2)
            if parte == "manta":
                cor_lisa(o2, hexa(p.get("manta"), MANTA_CORES, "#f6efe2"), 0.9)
            elif parte == "cabelo":
                cor_lisa(o2, cor)
            elif parte == "gorro":
                cor_lisa(o2, hexa(p.get("manta"), MANTA_CORES, "#f6efe2"), 0.9)
            malhas.append(o2)
        return arm, corpo, malhas, criados, guardados
    roupa = dict(p.get("roupa") or {})
    for lado in ("dir", "esq"):
        if (p.get("objetos") or {}).get(lado):
            roupa["mao_" + lado] = p["objetos"][lado]
    tem_chapeu = any(R.ITENS[v["id"]].get("slot") == "cabeca" and R.ITENS[v["id"]].get("achata") is not False
                     for v in roupa.values())
    # cabelo e barba
    pent = cab.get("penteado") or "cabelo"
    cor_cab = hexa(cab.get("cor"), CABELO_CORES, "#5a3f33")
    cabelos = []
    if pent != "careca":
        alvo = pent
        if tem_chapeu and pent + "_chapeu" in CAB.ITENS:
            alvo = pent + "_chapeu"
        base = cabelo_base(c, alvo) or cabelo_base(c, pent)
        if base is not None:
            o2 = copia(base, f"{c}__x__cabelo")
            cor_lisa(o2, cor_cab)
            criados.append(o2)
            cabelos.append(o2)
            malhas.append(o2)
    barba = cab.get("barba")
    if barba and barba != "nenhum":
        base = cabelo_base(c, barba)
        if base is not None:
            o2 = copia(base, f"{c}__x__barba")
            cor_lisa(o2, cor_cab)
            criados.append(o2)
            malhas.append(o2)
    # roupas
    vestidas = []
    for slot, v in roupa.items():
        base = peca_base(c, v["id"])
        if base is None:
            continue
        o2 = copia(base, f"{c}__x__{v['id']}")
        item = R.ITENS[v["id"]]
        tinge(o2, v["id"], v.get("cor") or (item.get("variacao") or {}).get("cor"))
        if os.environ.get("DIAG"):
            print("DIAG mat", v["id"], [(m.name, [nd.type for nd in m.node_tree.nodes]) for m in o2.data.materials if m and m.node_tree], flush=True)
        criados.append(o2)
        vestidas.append((v["id"], o2))
        malhas.append(o2)
    for rid, o in vestidas:
        it = R.ITENS[rid]
        if it.get("slot") == "cabeca" and it.get("achata") is not False:
            CF.cabelo_sob_chapeu(cabelos, o, arm)
    gr = int(p.get("gravidez") or 0)
    if gr:
        for o in [corpo] + [o for _, o in vestidas]:
            sk = o.data.shape_keys
            if sk:
                for k in (1, 2, 3):
                    kb = sk.key_blocks.get(f"gravidez_{k}")
                    if kb:
                        kb.value = 1.0 if k == gr else 0.0
    CF.esconde_pele_coberta(corpo, [o for _, o in vestidas if R.ITENS[_].get("tipo") != "mao"])
    return arm, corpo, malhas, criados, guardados


def desmonta(c, corpo, criados, guardados):
    for o in criados:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    for ob, mats in guardados:
        for i, m in enumerate(mats):
            novo = ob.data.materials[i]
            ob.data.materials[i] = m
            if novo is not m and novo and novo.users == 0:
                bpy.data.materials.remove(novo)
    mk = corpo.modifiers.get("pele coberta")
    if mk:
        corpo.modifiers.remove(mk)
    vg = corpo.vertex_groups.get("coberta")
    if vg:
        corpo.vertex_groups.remove(vg)
    sk = corpo.data.shape_keys
    if sk:
        for k in (1, 2, 3):
            kb = sk.key_blocks.get(f"gravidez_{k}")
            if kb:
                kb.value = 0.0
    for m in list(bpy.data.materials):
        if m.users == 0:
            bpy.data.materials.remove(m)


def posa(p, arm, corpo, malhas):
    c = p["corpo"]
    if c.startswith("recem"):  # deitado de costas, cabeça um pouco mais alta
        lug = arm.parent
        lug.matrix_world = Matrix.Rotation(math.radians(-80), 4, "X")
        bpy.context.view_layer.update()
        return
    anim = p.get("animacao") or "resident.idle.neutral"
    nome, quadro = (anim, QUADRO[anim]) if anim in MINI_POSES else POSE_PADRAO.get(GEMEO.get(c, c), ("resident.idle.neutral", 30))
    if c.startswith("bebe"):
        nome, quadro = POSE_PADRAO["bebe_m"]
    if not pose(arm, c, nome, quadro):
        pose(arm, c, "resident.idle.neutral", 30)
    # objetos de mão seguros como na página
    pp = {"arm": arm, "corpo": c, "id": p["id"]}
    for lado in ("dir", "esq"):
        v = (p.get("objetos") or {}).get(lado)
        if not v:
            continue
        o = bpy.data.objects.get(f"{c}__x__{v['id']}")
        if o is None:
            continue
        o.name = f"{c}_{v['id']}"  # segura/ponta_no_chao acham a peça por este nome
        bpy.context.view_layer.update()
        try:
            CC.segura(pp, v["id"])
            bpy.context.view_layer.update()
            CC.ponta_no_chao(pp, v["id"])
        except Exception as e:  # noqa: BLE001
            print("segura falhou", p["id"], v["id"], repr(e), flush=True)
        o.name = f"{c}__x__{v['id']}"


# ------------------------------------------------------------------ estúdio e câmera
def estudio(res, amostras, threads):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = amostras
    scn.cycles.use_denoising = True
    scn.cycles.device = "CPU"
    scn.cycles.max_bounces = 4
    scn.cycles.diffuse_bounces = 2
    scn.cycles.glossy_bounces = 1
    scn.cycles.transparent_max_bounces = 4
    scn.render.threads_mode = "FIXED"
    scn.render.threads = threads
    scn.render.resolution_x = scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("fundo_elenco")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.58, 0.66, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.45
    for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]:
        bpy.data.objects.remove(o, do_unlink=True)
    luzes = []
    for loc, e, s in (((-2.6, -4.2, 4.0), 700, 4), ((3.6, -2.2, 2.4), 260, 4), ((0.4, 3.2, 3.2), 380, 4)):
        ld = bpy.data.lights.new("luz_elenco", "AREA")
        ld.energy, ld.size = e, s
        lo = bpy.data.objects.new("luz_elenco", ld)
        scn.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        luzes.append(lo)
    cd = bpy.data.cameras.new("cam_elenco")
    cam = bpy.data.objects.new("cam_elenco", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cd.type = "ORTHO"
    return cam


def enquadra(cam, malhas, recem=False):
    """Câmera ortográfica três quartos de frente (35° para a direita do personagem, 7° de cima), o corpo inteiro."""
    dg = bpy.context.evaluated_depsgraph_get()
    az, el = math.radians(35), math.radians(7 if not recem else 38)
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))  # da pessoa à câmera
    fwd = -d
    right = fwd.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(fwd).normalized()
    pts = []
    for o in malhas:
        if o.hide_render:
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        pts += [mw @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    if not pts:
        return
    if os.environ.get("CABECA"):  # revisão: só a cabeça
        ztop = max(p.z for p in pts)
        pts = [p for p in pts if p.z > ztop - 0.32]
    us = [p.dot(right) for p in pts]
    vs = [p.dot(up) for p in pts]
    ws = [p.dot(d) for p in pts]
    cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
    tam = max(max(us) - min(us), max(vs) - min(vs)) * 1.08
    centro = right * cu + up * cv
    cam.location = centro + d * (max(ws) + 3.0)
    cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = tam
    cam.data.clip_end = 20


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    blend, arq, saida = a[0], a[1], a[2]
    opc = {a[i][2:]: a[i + 1] for i in range(3, len(a) - 1) if a[i].startswith("--") and not a[i + 1].startswith("--")}
    refaz = "--refaz" in a
    pessoas = json.load(open(arq))["personagens"]
    if "corpos" in opc:
        pessoas = [p for p in pessoas if p["corpo"] in opc["corpos"].split(",")]
    if "ids" in opc:
        pessoas = [p for p in pessoas if p["id"] in opc["ids"].split(",")]
    if not refaz:
        pessoas = [p for p in pessoas if not os.path.exists(os.path.join(saida, p["id"] + ".png"))]
    if not pessoas:
        print("nada a fazer")
        return
    os.makedirs(saida, exist_ok=True)
    t0 = time.time()
    bpy.ops.wm.open_mainfile(filepath=blend)
    acha_texturas()
    usados = {p["corpo"] for p in pessoas}
    for o in list(bpy.data.objects):
        dono = next((c for c in usados if o.name == c or o.name.startswith(c + "_")), None)
        if o.type in ("LIGHT", "CAMERA") or (dono is None and o.type in ("MESH", "ARMATURE", "EMPTY")):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    for c in usados:  # tudo do corpo escondido no início
        for o in sem_pai_corpo(c):
            o.hide_render = o.hide_viewport = True
        for o in bpy.data.objects:
            if o.parent and o.parent.name == c + "_lugar" and o.name != c:
                o.hide_render = o.hide_viewport = True
    cam = estudio(int(os.environ.get("RES", 256)), int(os.environ.get("AMOSTRAS", 12)),
                  int(os.environ.get("THREADS", 1)))
    print("pronto para montar", round(time.time() - t0), "s", flush=True)
    pessoas.sort(key=lambda p: p["corpo"])
    feitos = 0
    for p in pessoas:
        t1 = time.time()
        c = p["corpo"]
        for outro in usados:  # só este corpo aparece
            vis = outro == c
            for nm in (outro + "_corpo",):
                o = bpy.data.objects.get(nm)
                if o:
                    o.hide_render = o.hide_viewport = not vis
        try:
            arm, corpo, malhas, criados, guardados = monta(p)
        except Exception as e:  # noqa: BLE001
            print("ERRO montando", p["id"], repr(e), flush=True)
            continue
        posa(p, arm, corpo, malhas)
        acha_texturas()
        enquadra(cam, malhas, recem=c.startswith("recem"))
        bpy.context.scene.render.filepath = os.path.join(saida, p["id"] + ".png")
        bpy.ops.render.render(write_still=True)
        desmonta(c, corpo, criados, guardados)
        feitos += 1
        print(f"FEITO {p['id']} {c} {time.time() - t1:.1f}s", flush=True)
        if feitos % 15 == 0:
            bpy.data.orphans_purge(do_recursive=True)
    R.limpa_fontes()
    print("fim", feitos, round(time.time() - t0), "s", flush=True)


if __name__ == "__main__":
    main()
