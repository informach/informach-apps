"""Teste de encaixe da infraestrutura de ruas: dois trechos de bairro de 4 × 4 quadras montados com os GLB exportados
(ruas, pisos, estacionamentos e peças do pacote), mais uma conferência numérica das emendas.

Uso: blender-venv/bin/python -I morada-art/cidade_ruas_encaixe.py -- SP/cidade_out [a|b|asfalto ...] [--topo]
       [--sufixo=_antes]
O trecho "asfalto" sai de perto (encaixe_asfalto.png) e inteiro (encaixe_asfalto_geral.png).
Grava SP/cidade_out/ruas/encaixe_<x>.png (três quartos) e encaixe_<x>_topo.png (de cima, com --topo), e imprime as
emendas com degrau (> 2 cm) entre quadras vizinhas.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
Q = 15.0

# (categoria, id, coluna, linha, giro em graus, tamanho em quadras (nx, ny) já girado)
# Células: coluna i (oeste → leste), linha j (sul → norte); centro da célula = (−22,5 + 15 i, −22,5 + 15 j).
TRECHOS = {
    # A: rotatória grande (3 × 3) no canto sudoeste; rua em L por cima e pela direita, com peça do pacote,
    # cruzamento em T com faixas, lombada, curvas, baia de ônibus e estacionamento de 1 quadra.
    "a": [
        ("ruas", "rotatoria_grande", 0, 0, 0, (3, 3)),
        ("ruas", "road_009_pacote", 0, 3, 90, (1, 1)),
        ("ruas", "rua_cruzamento_t_faixas", 1, 3, 0, (1, 1)),
        ("ruas", "rua_lombada", 2, 3, 90, (1, 1)),
        ("ruas", "rua_curva", 3, 3, -90, (1, 1)),
        ("ruas", "rua_ponto_onibus", 3, 2, 0, (1, 1)),
        ("ruas", "rua_curva", 3, 1, 180, (1, 1)),
        ("estacionamentos", "estacionamento_quadra", 3, 0, 90, (1, 1)),
    ],
    # B: avenida leste-oeste cruzando a rua, cruzamento em X, T do pacote (rua com avenida), transição para
    # avenida e canteiro, faixa de pedestres, lombada, baia, estacionamento grande e de vagas inclinadas.
    "b": [
        ("ruas", "road_001_pacote", 0, 1, 90, (1, 1)),
        ("ruas", "avenida_reta_faixa_pedestres", 1, 1, 90, (1, 1)),
        ("ruas", "avenida_cruzamento_rua", 2, 1, 90, (1, 1)),
        ("ruas", "road_019_pacote", 3, 1, 0, (1, 1)),
        ("ruas", "rua_reta_faixa_pedestres", 2, 0, 0, (1, 1)),
        ("ruas", "rua_ponto_onibus", 3, 0, 0, (1, 1)),
        ("ruas", "rua_lombada", 2, 2, 0, (1, 1)),
        ("ruas", "rua_reta", 3, 2, 0, (1, 1)),
        ("ruas", "rua_cruzamento_x_faixas", 2, 3, 0, (1, 1)),
        ("ruas", "rua_cruzamento_t", 3, 3, -90, (1, 1)),
        ("ruas", "rua_transicao_avenida", 1, 3, 90, (1, 1)),
        ("ruas", "avenida_canteiro_inicio", 0, 3, 90, (1, 1)),
        ("estacionamentos", "estacionamento_grande", 0, 0, 0, (2, 1)),
        ("estacionamentos", "estacionamento_inclinado", 0, 2, 180, (2, 1)),
    ],
    # asfalto: as ruas do pacote entre as nossas retas (rua à esquerda, avenida no meio), para conferir de perto
    # se o tom do asfalto da textura do pacote bate com a cor "asfalto" nas emendas; à direita o T de rua com
    # avenida do pacote (girado: a avenida sai para leste) entre retas de rua e uma reta de avenida.
    "asfalto": [
        ("ruas", "rua_reta", 0, 0, 0, (1, 1)),
        ("ruas", "road_009_pacote", 0, 1, 0, (1, 1)),
        ("ruas", "rua_reta", 0, 2, 0, (1, 1)),
        ("ruas", "road_022_pacote", 0, 3, 0, (1, 1)),
        ("ruas", "avenida_reta", 1, 0, 0, (1, 1)),
        ("ruas", "road_001_pacote", 1, 1, 0, (1, 1)),
        ("ruas", "avenida_reta", 1, 2, 0, (1, 1)),
        ("ruas", "road_020_pacote", 1, 3, 0, (1, 1)),
        ("ruas", "rua_reta", 3, 0, 0, (1, 1)),
        ("ruas", "road_019_pacote", 3, 1, 180, (1, 1)),
        ("ruas", "rua_reta", 3, 2, 0, (1, 1)),
        ("ruas", "avenida_reta", 4, 1, 90, (1, 1)),
    ],
}
# vista de perto de cada trecho: (centro x, centro y, escala ortográfica); sem entrada = o trecho inteiro
PERTO = {"asfalto": (-7.5, -15.0, 34.0)}


def monta(saida, chave):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pecas = []
    for cat, id_, i, j, giro, (nx, ny) in TRECHOS[chave]:
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(saida, cat, "glb", id_ + ".glb"))
        novos = [o for o in bpy.data.objects if o not in antes]
        raiz = [o for o in novos if o.parent is None][0]
        cx = -2 * Q + Q * i + nx * Q / 2
        cy = -2 * Q + Q * j + ny * Q / 2
        raiz.location = (cx, cy, 0)
        raiz.rotation_mode = "XYZ"
        raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
        pecas.append((id_, i, j, nx, ny, novos))
        for o in novos:  # malhas de colisão (invisíveis no jogo) não entram no render
            if o.get("colisao"):
                o.hide_render = True
    bpy.context.view_layer.update()
    return pecas


def confere(pecas):
    """Raios de cima para baixo dos dois lados de cada emenda entre quadras vizinhas: compara a altura do topo."""
    dg = bpy.context.evaluated_depsgraph_get()
    dono = {}
    arvores = []
    for k, (id_, i, j, nx, ny, novos) in enumerate(pecas):
        for a in range(nx):
            for b in range(ny):
                dono[(i + a, j + b)] = (k, id_)
        for o in novos:
            if o.type == "MESH":
                arvores.append((o, BVHTree.FromObject(o, dg)))

    def topo(x, y):
        best = None
        for o, t in arvores:
            mi = o.matrix_world.inverted()
            hit = t.ray_cast(mi @ V((x, y, 30)), (mi.to_3x3() @ V((0, 0, -1))).normalized())
            if hit[0] is not None:
                z = (o.matrix_world @ hit[0]).z
                if z < 0.5:  # ignora placas, árvores e postes: só o chão
                    best = z if best is None else max(best, z)
        return best

    problemas = []
    for (i, j), id_ in dono.items():
        for di, dj in ((1, 0), (0, 1)):
            viz = dono.get((i + di, j + dj))
            if viz is None or viz == id_:
                continue
            id_a, id_b = id_[1], viz[1]
            x0 = -2 * Q + Q * (i + 1) if di else -2 * Q + Q * i
            y0 = -2 * Q + Q * (j + 1) if dj else -2 * Q + Q * j
            ruins, n = [], 0
            for k in range(1, 150):
                s = k * 0.1
                if di:
                    pa, pb = (x0 - 0.03, y0 + s), (x0 + 0.03, y0 + s)
                else:
                    pa, pb = (x0 + s, y0 - 0.03), (x0 + s, y0 + 0.03)
                za, zb = topo(*pa), topo(*pb)
                n += 1
                if za is None or zb is None or abs(za - zb) > 0.02:
                    ruins.append((round(s, 1), None if za is None else round(za, 3), None if zb is None else round(zb, 3)))
            if ruins:
                problemas.append((id_a, id_b, (i, j), (di, dj), len(ruins), n, ruins[:6]))
            print(f"emenda {id_a} ({i},{j}) | {id_b} ({i + di},{j + dj}): {n - len(ruins)}/{n} pontos sem degrau",
                  flush=True)
    return problemas


def render(arquivo, topo=False, res=(1800, 1400), amostras=40, perto=None):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    for nome in ("chao", "sol", "c"):  # segunda vista na mesma cena: refaz chão, sol e câmera (um sol só)
        ob = bpy.data.objects.get(nome)
        if ob:
            bpy.data.objects.remove(ob)
    w = bpy.data.worlds.get("w") or bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=300)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_vitrine")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin("#2A3D63"), 1)
    b.inputs["Roughness"].default_value = 0.9
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -0.42)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 2.2 if topo else 3.0
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    d = V((0.0, 0.0, 1.0)) if topo else V((0.45, -1.0, 1.05)).normalized()
    alvo = V((perto[0], perto[1], 0.0)) if perto else V((0, 0, 0))
    cam.location = alvo + d * 150
    cam.rotation_euler = (0, 0, 0) if topo else (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = perto[2] if perto else (62 if topo else 92)
    cd.clip_end = 400
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    chaves = [a for a in args[1:] if a in TRECHOS] or list(TRECHOS)
    for ch in chaves:
        pecas = monta(saida, ch)
        prob = confere(pecas)
        print(f"trecho {ch}: {len(prob)} emendas com degrau", flush=True)
        for p in prob:
            print("  DEGRAU", p, flush=True)
        suf = next((a.split("=", 1)[1] for a in args if a.startswith("--sufixo=")), "")
        if "--sem-render" not in args and ch in PERTO:
            render(os.path.join(saida, "ruas", f"encaixe_{ch}{suf}.png"), res=(1800, 1100), perto=PERTO[ch])
            render(os.path.join(saida, "ruas", f"encaixe_{ch}{suf}_geral.png"))
        elif "--sem-render" not in args:
            render(os.path.join(saida, "ruas", f"encaixe_{ch}.png"))
            if "--topo" in args:
                render(os.path.join(saida, "ruas", f"encaixe_{ch}_topo.png"), topo=True, res=(1400, 1400))
