"""Miniatura de cada item dos catálogos (roupas, acessórios, objetos de mão, cabelos), para a página escolher por imagem.

Cada item é encaixado na malha-base feminina do pacote (como em exporta_itens.py) e renderizado sozinho, com fundo
transparente, na cor inicial do catálogo (a mesma conta da cor livre da página). Cabelos, barbas e bigodes aparecem
na cabeça da malha-base, em castanho. Objetos de mão aparecem em pé. Saída: <saida>/<id>.webp (192 px).

Uso: python miniaturas_itens.py -- <saida> [ids separados por vírgula | todos]
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import roupas as R  # noqa: E402
import cabelos as CAB  # noqa: E402
import geradores as GER  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
SAIDA = a[0]
IDS = a[1] if len(a) > 1 else "todos"
PACOTES = os.path.join(AQUI, "ideias")
TAM = 192
os.makedirs(SAIDA, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.samples = 16
scn.cycles.use_denoising = True
scn.cycles.device = "CPU"
scn.render.resolution_x = scn.render.resolution_y = TAM
scn.render.film_transparent = True
scn.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.92, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
bpy.ops.object.light_add(type="SUN")
SOL = bpy.context.active_object
SOL.data.energy = 3.2
cd = bpy.data.cameras.new("c")
cam = bpy.data.objects.new("c", cd)
scn.collection.objects.link(cam)
scn.camera = cam
cd.type = "ORTHO"
CABELO_COR = (0.1, 0.055, 0.035, 1)


def tinge(ob, item_id, cor_hex):
    """A cor inicial na parte da máscara (cor livre): cor × (luminância do pixel ÷ luminância da cor principal)."""
    info = R.MASCARAS.get(item_id, {})
    if not cor_hex:
        return
    rgb = [((int(cor_hex[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5)]
    for k, m in enumerate(ob.data.materials):
        if not m or m.name not in info:
            continue
        mi = info[m.name]
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


def enquadra(obs, az=28, el=12, folga=1.12, so_um_lado=False):
    pts = [o.matrix_world @ Vector(c) for o in obs for c in o.bound_box]
    if so_um_lado:  # luvas e cotoveleiras: um lado só (os braços abertos deixam o par longe)
        pts = [o.matrix_world @ v.co for o in obs for v in o.data.vertices]
        pts = [p for p in pts if p.x < 0] or pts
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    d = Vector((math.sin(math.radians(az)), -math.cos(math.radians(az)), math.tan(math.radians(el)))).normalized()
    cam.location = c + d * 10
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    # tamanho pela projeção no plano da câmera
    mi = cam.matrix_world.inverted()
    bpy.context.view_layer.update()
    mi = cam.matrix_world.inverted()
    q = [mi @ p for p in pts]
    larg = max(max(p.x for p in q) - min(p.x for p in q), max(p.y for p in q) - min(p.y for p in q))
    cx = (max(p.x for p in q) + min(p.x for p in q)) / 2
    cy = (max(p.y for p in q) + min(p.y for p in q)) / 2
    cam.location = cam.matrix_world @ Vector((cx, cy, 0))
    cd.ortho_scale = larg * folga
    SOL.rotation_euler = (math.radians(50), math.radians(10), math.radians(az + 25))


def grava(item_id):
    png = os.path.join(SAIDA, item_id + ".png")
    scn.render.filepath = png
    bpy.ops.render.render(write_still=True)
    from PIL import Image
    Image.open(png).save(os.path.join(SAIDA, item_id + ".webp"), "WEBP", quality=82, method=6)
    os.remove(png)


X, arm = None, None


def base():
    global X, arm
    if X is None or X.name not in bpy.data.objects:
        arq, nome = R.BASES["f"]
        X = R.importa(arq, PACOTES)[nome]
        arm = next(m.object for m in X.modifiers if m.type == "ARMATURE")
        for pb in arm.pose.bones:
            pb.matrix_basis.identity()
        bpy.context.view_layer.update()
    return X, arm


def esconde_resto(mostrar):
    keep = {o.name for o in mostrar}
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o.name not in keep


itens = [("roupa", x) for x in R.CATALOGO["itens"]] + [("cabelo", x) for x in CAB.CATALOGO["itens"]]
if IDS != "todos":
    quer = set(IDS.split(","))
    itens = [(k, x) for k, x in itens if x["id"] in quer]
feitos = 0
for kind, item in itens:
    try:
        Xb, armb = base()
        it = R._resolve(item) if kind == "roupa" else item
        if kind == "cabelo":
            ob = CAB.encaixa(item, armb, Xb, PACOTES)
            mat = bpy.data.materials.new("cab")
            mat.use_nodes = True
            mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = CABELO_COR
            mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
            ob.data.materials.clear()
            ob.data.materials.append(mat)
            if not Xb.get("pele_mini"):  # a malha-base sem textura (no pacote ela vem de fora): cor de pele lisa
                pm = bpy.data.materials.new("pele_mini")
                pm.use_nodes = True
                pm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.52, 0.4, 1)
                Xb.data.materials.clear()
                Xb.data.materials.append(pm)
                Xb["pele_mini"] = 1
            esconde_resto([ob, Xb])
            # a cabeça da malha-base, de frente e um pouco de lado
            hmin, hmax = CAB.caixa_cabeca(Xb)
            caixa = bpy.data.objects.new("caixa", None)
            pts = [Vector(hmin), Vector(hmax)] + [ob.matrix_world @ Vector(c) for c in ob.bound_box]
            lo = Vector((min(p.x for p in pts), min(p.y for p in pts), max(min(p.z for p in pts), hmin[2] - 0.02)))
            hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
            emp = bpy.data.meshes.new("e")
            emp.from_pydata([lo[:], hi[:]], [], [])
            eo = bpy.data.objects.new("e", emp)
            scn.collection.objects.link(eo)
            enquadra([eo], az=24, el=6, folga=1.08)
            bpy.data.objects.remove(eo, do_unlink=True)
        elif it.get("gerar", {}).get("tipo") == "objeto":
            ob = GER.objeto(it["gerar"])
            # em pé: x (para os dedos) para baixo; com pose de segurar, o eixo do objeto é o y da mão (para cima)
            ps = it.get("pose") or {}
            if "aponta" in ps:  # em pé no punho: o eixo Y para cima
                ob.rotation_euler = (math.radians(90), 0, 0)
            elif ps.get("eixos", {}).get("x", [0, -1, 0])[1] < -0.5:  # pendurado (bolsa, bengala): X para baixo
                ob.rotation_euler = (0, math.radians(90), 0)
            else:  # celular, livro, câmera: X para cima
                ob.rotation_euler = (0, math.radians(-90), 0)
            R.garante_mascara(ob, item["id"])
            tinge(ob, item["id"], it.get("variacao", {}).get("cor"))
            esconde_resto([ob])
            bpy.context.view_layer.update()
            enquadra([ob], az=30, el=14)
        else:
            ob = R.veste(item, armb, Xb, PACOTES)
            tinge(ob, item["id"], it.get("variacao", {}).get("cor"))
            esconde_resto([ob])
            bpy.context.view_layer.update()
            cabeca = it.get("tipo") in ("cabeca", "rosto")
            um = it.get("slot") in ("maos", "cotovelos")
            enquadra([ob], az=-35 if um else (26 if cabeca else 18), el=14 if cabeca else 6, so_um_lado=um)
        grava(item["id"])
        bpy.data.objects.remove(ob, do_unlink=True)
        feitos += 1
        print("mini", item["id"], flush=True)
    except Exception as e:
        print("falhou", item["id"], repr(e), flush=True)
R.salva_mascaras()
print("fim", feitos)
