"""Teste de cena da categoria props_praia: um trecho de orla com 4 × 3 quadras de praia (calçadão com areia, areia
e beira-mar) e o mar da categoria agua (agua_aberta e, ao lado, a orla com mureta), a rua e uma fileira de prédios
tropicais atrás, palmeiras de vegetacao, postes e bancos de mobiliario_urbano, a kombi e o food truck de sorvete
(utilitarios) e o bugue (carros), com as peças de praia espalhadas. Dia e noite.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/props_praia_cena.py -- SP/cidade_out [dia|noite] [--perto]
Grava SP/cidade_out/props_praia/teste_cena_dia.png, teste_cena_noite.png (e teste_cena_perto_*.png com --perto).
Com --encaixe: SP/cidade_out/props_praia/encaixe.png (pisos de praia com os da categoria agua e pisos, de cima).
"""
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
PP = "props_praia"
XS = {"A": -30.0, "B": -15.0, "C": 0.0, "D": 15.0, "E": 30.0}
YS = {-1: -30.0, 0: -15.0, 1: 0.0, 2: 15.0, 3: 30.0, 4: 45.0}

# (categoria, id, x, y, giro)
QUADRAS = []
for c in "ABCDE":
    QUADRAS.append(("pisos", "piso_calcada_lisa", XS[c], YS[-1], 0))
    QUADRAS.append(("ruas", "rua_reta_faixa_pedestres" if c == "C" else "rua_reta", XS[c], YS[0], 90))
for c in "ABCD":
    QUADRAS += [(PP, "piso_areia_calcadao", XS[c], YS[1], 0), (PP, "piso_areia", XS[c], YS[2], 0),
                (PP, "piso_areia_mar", XS[c], YS[3], 0), ("agua", "agua_aberta", XS[c], YS[4], 0)]
QUADRAS += [("agua", "orla", XS["E"], YS[1], 0), ("agua", "agua_aberta", XS["E"], YS[2], 0),
            ("agua", "agua_aberta", XS["E"], YS[3], 0), ("agua", "agua_aberta", XS["E"], YS[4], 0)]

PREDIOS = [("predios_tropicais", "cabana_redonda", -30, -30, 180), ("predios_tropicais", "bar_praia_lilas", -15, -30, 180),
           ("predios_tropicais", "bar_barril", 0, -30, 180), ("predios_tropicais", "loja_surfe", 15, -30, 180),
           ("predios_tropicais", "sorveteria", 30, -30, 180)]

PROPS = [
    # calçadão e faixa de areia junto à mureta
    (PP, "quiosque_sucos_coco_gigante", -31.0, 3.9, 0),
    (PP, "quiosque_coco_palha", -19.5, 3.6, 0),
    (PP, "barraca_praia_mesa", -11.0, 4.2, 0),
    (PP, "deque_madeira_praia", 0.0, 5.5, 0),
    (PP, "placa_praia", -2.9, -0.95, 0),
    (PP, "chuveirinho_praia", 2.7, -0.6, 0),
    (PP, "quiosque_estacao_surfe", 10.8, 4.0, 0),
    (PP, "barraca_acai_abacaxi", 18.6, 4.2, 0),
    (PP, "lixeira_praia", -12.6, -0.95, 0), (PP, "lixeira_praia", 12.8, -0.95, 0),
    (PP, "carrinho_picole", -14.0, -4.0, 90),
    (PP, "varal_luzes_praia", -15.0, 7.0, 0),
    (PP, "placa_praia_direcao", -27.4, -0.9, 0),
    # areia
    (PP, "castelo_areia_gigante", -30.0, 15.0, 0),
    (PP, "tenda_lona_estrela", -14.6, 15.5, 0),
    (PP, "espreguicadeira_lona", -16.2, 14.6, 180), (PP, "espreguicadeira_lona", -13.4, 14.6, 180),
    (PP, "caixa_termica_praia", -14.8, 13.6, 20),
    (PP, "guarda_sol_praia_azul", -4.2, 11.0, 180),
    (PP, "espreguicadeira_madeira", -5.0, 11.6, 180), (PP, "espreguicadeira_madeira", -3.4, 11.6, 180),
    (PP, "guarda_sol_praia_laranja", 4.2, 15.5, 180),
    (PP, "espreguicadeira_reclinavel", 3.4, 16.0, 180), (PP, "espreguicadeira_reclinavel", 5.0, 16.0, 180),
    (PP, "toalha_praia_listras", -3.6, 18.2, 10), (PP, "toalha_praia_melancia", -1.4, 19.0, -8),
    (PP, "guarda_sol_praia_roxo", -2.4, 20.4, 180),
    (PP, "guarda_sol_praia_estrela", 4.0, 9.8, 0), (PP, "toalha_praia_ondas", 4.6, 9.9, 80),
    (PP, "rede_volei_praia", 15.0, 11.5, 0),
    (PP, "posto_salva_vidas_azul", 13.5, 19.0, 180),
    (PP, "bandeira_aviso_vermelha", 18.6, 21.5, 0),
    (PP, "guarda_sol_praia_arco_iris", -9.0, 20.5, 0),
    (PP, "cadeira_praia_dobravel", -9.6, 20.1, 180), (PP, "cadeira_praia_dobravel", -8.3, 20.3, 160),
    (PP, "cesta_piquenique", -8.9, 21.3, 0),
    # beira-mar
    (PP, "mastro_biruta", -25.5, 24.0, 0),
    (PP, "bandeira_aviso_verde", -34.0, 24.4, 0),
    (PP, "piscina_inflavel", -20.5, 25.0, 0),
    (PP, "boia_pato", -17.4, 26.0, 30), (PP, "boia_rosquinha", -15.6, 25.2, 0),
    (PP, "castelo_areia_pequeno", -11.0, 24.6, 0),
    (PP, "prancha_surfe_deitada_azul", -5.2, 25.4, 70), (PP, "bodyboard_azul", -2.6, 26.0, 20),
    (PP, "prancha_surfe_longboard_verde", 0.6, 25.0, 100),
    (PP, "suporte_pranchas_surfe", 8.5, 24.6, 180),
    (PP, "poste_boia_salva_vidas", 4.6, 24.0, 180),
    (PP, "bandeira_aviso_amarela", 21.0, 25.0, 0),
]
OUTROS = [
    # palmeiras e mobiliário do calçadão
    ("vegetacao", "palmeira", -36.0, 0.6, 0), ("vegetacao", "palmeira", -25.5, 0.8, 70),
    ("vegetacao", "palmeira", -6.0, 0.5, 140), ("vegetacao", "palmeira", 6.5, 0.7, 200),
    ("vegetacao", "palmeira", 22.0, 9.0, 30), ("vegetacao", "palmeira", -37.0, 21.5, 100),
    ("vegetacao", "palm_03_pacote", -22.8, 22.0, 0), ("vegetacao", "palm_03_pacote", 21.5, 15.0, 0),
    ("mobiliario_urbano", "poste_rua", -33.0, -6.9, 0), ("mobiliario_urbano", "poste_rua", -18.0, -6.9, 0),
    ("mobiliario_urbano", "poste_rua", -3.0, -6.9, 0), ("mobiliario_urbano", "poste_rua", 12.0, -6.9, 0),
    ("mobiliario_urbano", "banco_praca_madeira", -24.5, -3.3, 180), ("mobiliario_urbano", "banco_praca_madeira", -6.5, -3.3, 180),
    ("mobiliario_urbano", "banco_praca_madeira", 8.0, -3.3, 180),
    ("mobiliario_urbano", "bicicletario", 4.5, -5.6, 0),
    # veículos
    ("utilitarios", "kombi_viagem", -22.0, -13.2, -90),
    ("utilitarios", "food_truck_sorvete", 6.0, -12.95, 90),
    ("carros", "bugue_laranja", 8.2, 20.2, 20),
]


def importa(cat, id_, x, y, giro, saida):
    caminho = os.path.join(saida, cat, "glb", id_ + ".glb")
    if not os.path.exists(caminho):
        print("falta", caminho, flush=True)
        return []
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    return novos


def monta(saida, so_pisos=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for cat, id_, x, y, g in QUADRAS:
        importa(cat, id_, x, y, g, saida)
    if so_pisos:
        return
    for cat, id_, x, y, g in PREDIOS + PROPS + OUTROS:
        importa(cat, id_, x, y, g, saida)


def render(arquivo, noite=False, res=(1800, 1300), amostras=40, modo="geral"):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.4 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=600)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_vitrine")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else "#2A3D63"), 1)
    b.inputs["Roughness"].default_value = 0.9
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -2.2)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.5 if noite else 3.0
    if noite:
        ld.color = (0.6, 0.7, 1.0)
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    if modo == "encaixe":
        d = V((0.25, -0.6, 1.6)).normalized()
        alvo = V((0, 7.5, 0.0))
        cd.ortho_scale = 88
    elif modo == "perto":
        d = V((0.5, -1.0, 0.62)).normalized()
        alvo = V((-8.0, 8.0, 2.0))
        cd.ortho_scale = 46
    else:
        d = V((0.42, -1.0, 1.0)).normalized()
        alvo = V((-1.0, 9.0, 2.0))
        cd.ortho_scale = 92
    cam.location = alvo + d * 300
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.clip_end = 800
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    if "--encaixe" in args:
        monta(saida, so_pisos=True)
        render(os.path.join(saida, PP, "encaixe.png"), res=(1800, 1500), modo="encaixe")
        sys.exit(0)
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    perto = "--perto" in args
    for md in modos:
        monta(saida)
        nome = f"teste_cena_perto_{md}.png" if perto else f"teste_cena_{md}.png"
        render(os.path.join(saida, PP, nome), noite=md == "noite", modo="perto" if perto else "geral")
