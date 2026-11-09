"""Teste de cena da categoria props_lazer: uma praça de lazer de 2 × 2 quadras (30 × 30 m) com o anel de ruas em
volta (4 × 4 quadras). Usa os caminhos de parque_areas (cruz e fim de caminho), o piso de praça de pisos, as ruas,
árvores e palmeiras de vegetacao, bancos, postes e lixeiras de mobiliario_urbano e as peças de props_lazer:
- sudoeste: caminho em cruz com os brinquedos de praça avulsos e o arco vermelho na entrada;
- sudeste: fim de caminho com o chafariz do globo e as estátuas, arco de tijolos na entrada;
- noroeste: piso de praça com o palco coberto, mesa de DJ, caixas de som e a arquibancada;
- nordeste: piso de praça com o quiosque de sorvete, os carrinhos, a mesa coberta e o banco da árvore;
- um varal de lampadinhas de 15 m amarrado entre duas palmeiras.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/props_lazer_cena.py -- SP/cidade_out [dia|noite] [--perto]
Grava SP/cidade_out/props_lazer/teste_cena_dia.png e teste_cena_noite.png (teste_cena_perto_*.png com --perto).
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
N = 4
PL, PA, VE, MO = "props_lazer", "parque_areas", "vegetacao", "mobiliario_urbano"


def centro(i, j):
    return (-N * Q / 2 + Q * i + Q / 2, -N * Q / 2 + Q * j + Q / 2)


TILES = []
for i in (1, 2):
    TILES += [("ruas", "rua_reta", i, 0, 90), ("ruas", "rua_reta_faixa_pedestres" if i == 1 else "rua_reta", i, 3, 90)]
for j in (1, 2):
    TILES += [("ruas", "rua_reta_faixa_pedestres" if j == 1 else "rua_reta", 0, j, 0), ("ruas", "rua_reta", 3, j, 0)]
TILES += [("ruas", "rua_curva", 0, 0, 90), ("ruas", "rua_curva", 3, 0, 180), ("ruas", "rua_curva", 3, 3, -90),
          ("ruas", "rua_curva", 0, 3, 0)]
TILES += [(PA, "caminho_parque_cruz", 1, 1, 0), (PA, "caminho_parque_fim", 2, 1, -90), ("pisos", "piso_praca", 1, 2, 0),
          ("pisos", "piso_praca", 2, 2, 0)]

# (categoria, id, x, y, giro, z) em coordenadas do mundo (centro da praça na origem)
SW, SE, NW, NE = centro(1, 1), centro(2, 1), centro(1, 2), centro(2, 2)


def em(c, dx, dy):
    return c[0] + dx, c[1] + dy


PROPS = [
    # sudoeste: brinquedos
    (PL, "balanco_duplo", *em(SW, -4.3, 4.4), 0, 0),
    (PL, "gira_gira_praca", *em(SW, 3.6, 3.4), 0, 0),
    (PL, "gangorra_praca", *em(SW, 4.6, 6.2), 0, 0),
    (PL, "caixa_areia_foguete", *em(SW, -4.6, -3.6), 0, 0),
    (PL, "escorregador_praca", *em(SW, 4.3, -4.4), -45, 0),
    (PL, "casinha_brincar", *em(SW, -2.6, -6.3), 0, 0),
    (PL, "trepa_trepa_cubos", *em(SW, -6.0, -6.4), 0, 0),
    (PL, "arco_praca_metal_vermelho", *em(SW, 0, -6.6), 0, 0),
    (PL, "arco_praca_tijolo", *em(SW, -6.4, 0), 90, 0),
    (PL, "brinquedo_moeda_carrinho", *em(SW, 2.4, 2.0), -90, 0),
    # sudeste: estátuas e chafariz
    (PL, "chafariz_globo", *em(SE, 0.6, 0.0), 0, 0),
    (PL, "estatua_cavaleiro", *em(SE, 0.6, 5.0), 0, 0),
    (PL, "estatua_leao", *em(SE, -4.6, 4.4), 0, 0),
    (PL, "estatua_atleta", *em(SE, 5.0, -4.8), 180, 0),
    (PL, "estatua_morada", *em(SE, -4.4, -4.6), 180, 0),
    (PL, "placa_direcoes_parque", *em(SE, -2.6, 1.9), 0, 0),
    (PL, "poste_lanternas_chinesas", *em(SE, 5.4, 2.6), 0, 0),
    # noroeste: palco
    (PL, "palco_coberto_pequeno", *em(NW, -0.4, 3.9), 0, 0),
    (PL, "mesa_dj", *em(NW, -0.4, 4.3), 0, 0.8),
    (PL, "caixas_som_grandes", *em(NW, -2.0, 4.2), 15, 0.8),
    (PL, "caixas_som_grandes", *em(NW, 1.2, 4.2), -15, 0.8),
    (PL, "caixas_som_pequenas", *em(NW, -3.9, 0.8), 30, 0),
    (PL, "caixas_som_pequenas", *em(NW, 3.1, 0.8), -30, 0),
    (PL, "arquibancada_praca", *em(NW, -0.4, -4.3), 180, 0),
    (PL, "varal_lampadas_coloridas", *em(NW, -6.3, 0.2), 90, 0),
    # nordeste: comida e descanso
    (PL, "quiosque_sorvete_casquinha", *em(NE, 3.6, 3.0), -30, 0),
    (PL, "carrinho_cachorro_quente", *em(NE, -3.9, 4.2), 0, 0),
    (PL, "carrinho_pipoca", *em(NE, -0.6, 5.0), 0, 0),
    (PL, "carrinho_algodao_doce", *em(NE, 5.6, -1.2), -90, 0),
    (PL, "carrinho_baloes", *em(NE, 0.9, -0.8), 0, 0),
    (PL, "mesa_piquenique_coberta", *em(NE, -3.8, -3.6), 0, 0),
    (PL, "banco_circular_arvore", *em(NE, 3.5, -4.6), 0, 0),
    # varal de 15 m entre duas palmeiras (norte da praça)
    (VE, "palmeira", -1.6, 13.6, 0, 0), (VE, "palmeira", 13.4, 13.6, 0, 0),
    (PL, "varal_lampadas_15m", 5.9, 13.6, 0, 0),
    # árvores, arbustos, bancos, postes e lixeiras
    (VE, "arvore_redonda_media", *em(SW, 6.0, 6.3), 0, 0), (VE, "arvore_florida_rosa", *em(SW, -6.2, 6.2), 0, 0),
    (VE, "arvore_redonda_media", *em(SE, 6.0, 6.0), 0, 0), (VE, "arvore_florida_rosa", *em(SE, 6.3, -1.3), 0, 0),
    (VE, "arbusto_redondo", *em(SE, -2.0, 6.4), 0, 0), (VE, "arbusto_redondo", *em(SE, 3.0, -6.6), 0, 0),
    (VE, "arvore_redonda_media", *em(NW, -6.0, -6.2), 0, 0), (VE, "arvore_redonda_media", *em(NE, 6.2, 6.5), 0, 0),
    (VE, "canteiro_flores", *em(NE, -0.2, -6.4), 0, 0),
    (MO, "banco_praca_madeira", *em(SW, 2.4, -2.2), 0, 0), (MO, "banco_praca_madeira", *em(SE, -4.2, -2.2), 0, 0),
    (MO, "banco_praca_madeira", *em(SE, -4.2, 2.2), 180, 0),
    (MO, "poste_praca_4_lanternas", *em(SW, -2.3, 2.3), 0, 0),
    (MO, "poste_praca_4_lanternas", *em(SW, -2.3, -2.3), 0, 0),
    (MO, "poste_praca_4_lanternas", *em(SE, -2.3, -2.3), 0, 0), (MO, "poste_praca_4_lanternas", *em(SE, 3.6, 2.3), 0, 0),
    (MO, "poste_praca_4_lanternas", *em(NW, -6.3, 5.8), 0, 0), (MO, "poste_praca_4_lanternas", *em(NE, -6.4, 6.4), 0, 0),
    (MO, "poste_praca_4_lanternas", *em(NE, 0.0, 1.8), 0, 0),
    (MO, "lixeira_reciclagem", *em(NE, -0.6, 2.9), 0, 0), (MO, "lixeira_comum", *em(SW, 2.0, -6.4), 0, 0),
]
PROPS = [p for p in PROPS if p]


def importa(caminho, x, y, giro, z=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    return novos


def monta(saida):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for cat, id_, i, j, giro in TILES:
        x, y = centro(i, j)
        importa(os.path.join(saida, cat, "glb", id_ + ".glb"), x, y, giro)
    for cat, id_, x, y, giro, z in PROPS:
        importa(os.path.join(saida, cat, "glb", id_ + ".glb"), x, y, giro, z)


def render(arquivo, noite=False, res=(1800, 1300), amostras=48, perto=False):
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
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.35 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
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
    ob.location = (0, 0, -2.0)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.45 if noite else 3.0
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
    if perto:
        d = V((0.55, -1.0, 0.62)).normalized()
        alvo = V((-4.0, -2.0, 1.5))
        cd.ortho_scale = 38
    else:
        d = V((0.45, -1.0, 1.0)).normalized()
        alvo = V((0, 1.5, 2.0))
        cd.ortho_scale = 60
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
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    perto = "--perto" in args
    for md in modos:
        monta(saida)
        nome = f"teste_cena_perto_{md}.png" if perto else f"teste_cena_{md}.png"
        render(os.path.join(saida, PL, nome), noite=md == "noite", perto=perto)
