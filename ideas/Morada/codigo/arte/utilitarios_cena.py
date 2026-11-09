"""Teste de cena dos utilitários: cruzamento de ruas com prédios e veículos; bonde na rua com trilhos; trem de
passageiros na via com plataforma; trem do tubo no tubo de vidro. Renderiza de dia e de noite e três closes dos
encaixes nos trilhos.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/utilitarios_cena.py -- SP/cidade_out [dia|noite|closes]
Grava SP/cidade_out/utilitarios/teste_cena_dia.png, teste_cena_noite.png e teste_cena_trilhos.png.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
Q = 15.0
SAIDA = sys.argv[sys.argv.index("--") + 1]
MODOS = sys.argv[sys.argv.index("--") + 2:] or ["dia", "noite", "closes"]
PASTA = os.path.join(SAIDA, "utilitarios")
CAT = json.load(open(os.path.join(PASTA, "catalogo.json")))
ITENS = {i["id"]: i for i in CAT["itens"]}


def poe(cat, id_, x, y, z=0.0, rot=0.0):
    """Importa o GLB <cat>/glb/<id>.glb e põe a raiz em (x, y, z), girada rot graus em Z."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SAIDA, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (0, 0, math.radians(rot))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    return raiz


def trem(ids, x, y_frente, z, rot=0.0):
    """Encosta engate com engate, a partir da frente (y_frente = face do engate da frente), seguindo para +Y."""
    y = y_frente
    for id_ in ids:
        ef, et = ITENS[id_]["engate"]
        y += ef
        poe("utilitarios", id_, x, y, z, rot)
        y += et


def monta():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # cruzamento 3 × 3 (centro em 0, 0)
    poe("ruas", "rua_cruzamento_x", 0, 0)
    poe("ruas", "rua_reta", 0, Q)
    poe("ruas", "rua_reta", 0, -Q)
    poe("ruas", "rua_reta", Q, 0, rot=90)
    poe("ruas", "rua_reta", -Q, 0, rot=90)
    for sx, sy, piso, predio, rot in ((1, 1, "piso_calcada_lisa", "loja_esquina_cafe", 180),
                                       (-1, 1, "piso_calcada_lisa", "apto_baia_azul", 0),
                                       (-1, -1, "piso_praca", None, 0),
                                       (1, -1, "piso_calcada_lisa", "mercadinho", 0)):
        poe("pisos", piso, sx * Q, sy * Q)
        if predio:
            poe("predios_regulares", predio, sx * Q, sy * Q, rot=rot)
    # veículos no cruzamento (mão brasileira: quem vai para −Y anda em x < 0)
    zr = -0.10
    f = 1.825
    poe("utilitarios", "onibus_turismo_azul", -f, Q + 2.0, zr)
    poe("utilitarios", "carro_rabo_de_peixe_rosa", f, Q - 3.0, zr, rot=180)
    poe("utilitarios", "ambulancia", -f, -Q - 1.0, zr)
    poe("utilitarios", "kombi_viagem", f, -Q + 1.5, zr, rot=180)
    poe("utilitarios", "caminhao_bombeiros", Q + 1.0, -f, zr, rot=-90)
    poe("utilitarios", "carro_antigo_preto", Q - 4.0, f, zr, rot=90)
    poe("utilitarios", "caminhao_lixo", -Q - 2.0, f, zr, rot=90)
    poe("utilitarios", "food_truck_sorvete", -Q + 2.5, -f, zr, rot=-90)
    poe("utilitarios", "carro_antigo_laranja", -3.0, -f, zr, rot=-90)
    # bonde: rua com trilhos de bonde (x = −30), bonde para −Y na faixa da esquerda e VLT para +Y
    for y in (-Q, 0, Q):
        poe("ferrovia", "bonde_rua", -2 * Q, y)
    poe("utilitarios", "bonde", -2 * Q - f, -2.0, -0.094)
    poe("utilitarios", "bonde_moderno", -2 * Q + f, 6.0, -0.094, rot=180)
    # ferrovia (x = 30): duas retas e a plataforma; o trem encosta na plataforma
    poe("ferrovia", "trilho_reto", 2 * Q, -Q)
    poe("ferrovia", "trilho_reto", 2 * Q, 0)
    poe("ferrovia", "plataforma_estacao", 2 * Q, Q)
    trem(["trem_locomotiva", "trem_vagao_passageiros", "trem_vagao_cauda"], 2 * Q, -20.0, 0.31)
    # trem do tubo (x = 45, elevado)
    for y in (-Q, 0, Q):
        poe("ferrovia", "trem_tubo_reto", 3 * Q, y)
    trem(["trem_tubo_frente", "trem_tubo_vagao"], 3 * Q, -18.0, 7.76)


def mundo(noite):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 40))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#14203C" if noite else "#9DC4EC"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.35 if noite else 0.75
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.35 if noite else 3.2
    if noite:
        ld.color = (0.6, 0.7, 1.0)
    ld.angle = math.radians(5)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(45), 0, math.radians(-35))
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    if not noite:  # de dia as estampas emissivas e neons ficam fracos, como na página
        for m in bpy.data.materials:
            if m.use_nodes and (m.name.startswith("estampa_") or m.name.startswith("neon")):
                b = m.node_tree.nodes.get("Principled BSDF")
                if b and b.inputs["Emission Strength"].default_value > 0:
                    b.inputs["Emission Strength"].default_value *= 0.25
    # chão em volta
    me = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
    bm.to_mesh(me)
    bm.free()
    m, b = mb._principled("chao_cena")
    b.inputs["Base Color"].default_value = (*mb._lin("#2E4A2A" if noite else "#7ACB4C"), 1)
    me.materials.append(m)
    ob = bpy.data.objects.new("chao", me)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -0.42)


def camera(loc, alvo, lente=40, res=(1800, 1000), orto=None):
    scn = bpy.context.scene
    cd = bpy.data.cameras.new("c")
    if orto:
        cd.type = "ORTHO"
        cd.ortho_scale = orto
    else:
        cd.lens = lente
    cd.clip_end = 2000
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (V(alvo) - V(loc)).to_track_quat("-Z", "Y").to_euler()
    scn.camera = cam
    scn.render.resolution_x, scn.render.resolution_y = res
    return cam


def render(arq):
    scn = bpy.context.scene
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arq
    bpy.ops.render.render(write_still=True)
    print("render", arq, flush=True)


def main():
    for modo in MODOS:
        monta()
        if modo in ("dia", "noite"):
            mundo(modo == "noite")
            camera((14, -88, 66), (8, 0, 0), lente=33)
            render(os.path.join(PASTA, f"teste_cena_{modo}.png"))
        elif modo == "closes":
            mundo(False)
            arqs = []
            vistas = [((2 * Q + 9.0, -24.0, 2.2), (2 * Q, -14.0, 0.8), 32, "trem"),
                      ((-2 * Q - 9.0, -10.0, 2.0), (-2 * Q - 1.0, -2.5, 0.8), 30, "bonde"),
                      ((3 * Q + 8.0, -27.0, 11.5), (3 * Q, -12.0, 8.8), 38, "tubo")]
            for loc, alvo, lente, nome in vistas:
                camera(loc, alvo, lente=lente, res=(900, 640))
                a = os.path.join(PASTA, f"_close_{nome}.png")
                render(a)
                arqs.append(a)
            from PIL import Image
            ims = [Image.open(a) for a in arqs]
            out = Image.new("RGB", (sum(i.width for i in ims), ims[0].height))
            x = 0
            for i in ims:
                out.paste(i, (x, 0))
                x += i.width
            out.save(os.path.join(PASTA, "teste_cena_trilhos.png"))
            for a in arqs:
                os.remove(a)


if __name__ == "__main__":
    main()
