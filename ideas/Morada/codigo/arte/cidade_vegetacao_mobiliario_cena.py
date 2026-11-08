"""Teste de cena da vegetação e do mobiliário urbano: uma praça de 2 × 2 quadras (piso de praça com rosácea, dois
trechos de grama com caminho e um gramado com a árvore enorme), cercada por um anel de ruas com cruzamentos nos cantos.
Semáforos nos cruzamentos de nordeste e sudoeste, placas nos outros dois, semáforo de pedestre nas faixas, postes nas
calçadas, pontos de ônibus, bancos, lixeiras, árvores e canteiros. De dia e de noite (à noite, cada lâmpada ganha uma
luz pontual só neste render, para ver o alcance dela no chão).

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_vegetacao_mobiliario_cena.py -- SP/cidade_out
     [dia|noite] [longe|perto]
Grava SP/cidade_out/mobiliario_urbano/teste_cena_{dia,noite}.png (vista inteira) e teste_cena_perto_{dia,noite}.png,
e copia as duas da vista inteira para SP/cidade_out/vegetacao/.
"""
import math
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_vegetacao_mobiliario_vitrines  # noqa: E402,F401  (estampas fracas de dia e fortes à noite)

V = Vector
Q, H = 15.0, 7.5
SAIDA = ""
VEG, MOB = "vegetacao", "mobiliario_urbano"
RAIZES = []


def importa(cat, id_, x, y, giro=0.0, z=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SAIDA, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    RAIZES.append((cat, id_, raiz, novos))
    return raiz


def rot(p, g):
    a = math.radians(g)
    return (p[0] * math.cos(a) - p[1] * math.sin(a), p[0] * math.sin(a) + p[1] * math.cos(a))


def de_frente(alfa):
    """Giro de uma peça (frente −Y) para ela olhar na direção de ângulo alfa (graus, a partir de +X)."""
    return alfa + 90


def monta():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # ---------------------------------------------------------------- pisos da praça (2 × 2)
    C = (H, H)
    importa("pisos", "piso_praca", *C)
    importa("pisos", "piso_grama_caminho", -H, H, 90)
    importa("pisos", "piso_grama_caminho", H, -H)
    importa("pisos", "piso_grama", -H, -H)
    # ---------------------------------------------------------------- anel de ruas
    L = Q + H  # 22,5
    for sx in (-1, 1):
        for sy in (-1, 1):
            importa("ruas", "rua_cruzamento_x_faixas", sx * L, sy * L)
    importa("ruas", "rua_reta_faixa_pedestres", -L, H)
    importa("ruas", "rua_reta_faixa_pedestres", L, H)
    importa("ruas", "rua_reta", -L, -H)
    importa("ruas", "rua_reta", L, -H)
    importa("ruas", "rua_reta_faixa_pedestres", H, -L, 90)
    importa("ruas", "rua_reta_faixa_pedestres", H, L, 90)
    importa("ruas", "rua_reta", -H, -L, 90)
    importa("ruas", "rua_reta", -H, L, 90)
    # ---------------------------------------------------------------- praça de rosácea (nordeste)
    importa(MOB, "relogio_rua", *C, 20)
    for alfa in (45, 135, 225, 315):
        p = (C[0] + 2.6 * math.cos(math.radians(alfa)), C[1] + 2.6 * math.sin(math.radians(alfa)))
        importa(MOB, "banco_curvo", *p, alfa - 90)
        q = (C[0] + 4.6 * math.cos(math.radians(alfa)), C[1] + 4.6 * math.sin(math.radians(alfa)))
        importa(MOB, "poste_praca_4_lanternas", *q)
    importa(MOB, "lixeira_reciclagem", C[0] + 2.05, C[1] - 6.0, -90)
    importa(MOB, "bebedouro", C[0] - 2.1, C[1] - 6.3, 0)
    importa(VEG, "bush_06_pacote", C[0] - 2.3, C[1] + 6.4)
    importa(VEG, "bush_07_pacote", C[0] + 2.3, C[1] + 6.4)
    importa(MOB, "lixeira_comum", C[0] + 6.3, C[1] - 2.1)
    importa(MOB, "luminaria_jardim", C[0] - 6.4, C[1] + 2.0)
    importa(MOB, "luminaria_jardim", C[0] - 6.4, C[1] - 2.0)
    # ---------------------------------------------------------------- grama com caminho em Y (sudeste)
    importa(MOB, "banco_praca_madeira", H - 2.15, -4.0, 90)
    importa(MOB, "banco_praca_madeira", H - 2.15, -11.0, 90)
    importa(MOB, "banco_praca_madeira", H + 2.15, -7.5, -90)
    importa(MOB, "lixeira_comum", H - 2.0, -5.7)
    importa(MOB, "trash_04_pacote", H + 2.0, -9.4)
    for x, y in ((H - 1.9, -1.6), (H + 1.9, -4.4), (H - 1.9, -8.8), (H + 1.9, -12.2)):
        importa(MOB, "luminaria_jardim", x, y)
    importa(MOB, "poste_praca_4_lanternas", H + 2.3, -1.6)
    importa(VEG, "arvore_redonda_media", 2.4, -8.0)
    importa(VEG, "arvore_oval_alta", 12.9, -5.3)
    importa(VEG, "arvore_oval_alta", 12.9, -9.4)
    importa(VEG, "pinheiro", 3.4, -2.6)
    importa(VEG, "arvore_redonda_grande", 2.8, -12.3)
    importa(VEG, "palm_03_pacote", 12.6, -13.2)
    importa(VEG, "touceira_grama", 11.4, -2.0)
    importa(VEG, "canteiro_flores", 11.6, -7.4, 90)
    importa(VEG, "arbusto_redondo", 4.6, -5.0)
    # ---------------------------------------------------------------- grama com caminho em X (noroeste)
    importa(MOB, "banco_praca_madeira", -5.0, H - 2.15, 0)
    importa(MOB, "banco_praca_madeira", -10.5, H + 2.15, 180)
    importa(MOB, "lixeira_comum", -3.2, H - 2.0)
    importa(MOB, "mesa_praca", -8.3, 12.2, 0)
    importa(MOB, "guarda_sol", -8.3, 12.2)
    importa(MOB, "churrasqueira_tambor_pacote", -5.6, 12.6)
    for x, y in ((-2.2, H + 1.9), (-6.8, H - 1.9), (-11.4, H + 1.9), (-14.0, H - 1.9)):
        importa(MOB, "luminaria_jardim", x, y)
    importa(VEG, "arvore_florida_rosa", -12.8, 3.6)
    importa(VEG, "arvore_outono", -6.6, 2.6)
    importa(VEG, "palmeira", -2.3, 12.4)
    importa(VEG, "topiaria_bolas", -13.2, 9.6)
    importa(VEG, "topiaria_espiral", -13.2, 11.0)
    importa(VEG, "cerca_viva", -12.4, 14.1)
    importa(VEG, "arvore_conica", -2.6, 2.6)
    # ---------------------------------------------------------------- gramado da árvore enorme (sudoeste)
    importa(VEG, "arvore_praca_gigante", -8.0, -8.2)
    importa(MOB, "banco_sem_encosto", -8.0, -1.4, 0)
    importa(MOB, "banco_sem_encosto", -1.8, -8.0, 90)
    importa(VEG, "floreira_redonda", -2.4, -2.4)
    importa(VEG, "floreira_redonda", -13.6, -2.4)
    importa(VEG, "canteiro_flores", -8.0, -14.0)
    importa(VEG, "touceira_grama", -13.6, -13.4)
    importa(VEG, "arbusto_redondo", -2.4, -13.4)
    importa(VEG, "pine_01_pacote", -14.0, -8.5)
    importa(VEG, "vaso_calcada", -2.0, -3.9)
    # ---------------------------------------------------------------- cruzamentos
    for g in (0, 90, 180, 270):  # nordeste: semáforo de braço no canto do outro lado, à direita
        p = rot((5.25, 5.25), g)
        importa(MOB, "traffic_light_002_pacote", L + p[0], L + p[1], g)
    for g in (0, 90, 180, 270):  # sudoeste: semáforo de braço no canto do outro lado, à esquerda
        p = rot((-5.25, 5.25), g)
        importa(MOB, "traffic_light_001_pacote", -L + p[0], -L + p[1], g)
    for (cx, cy) in ((-L, L), (L, -L)):  # noroeste e sudeste: PARE numa rua, preferência na outra
        for g, pid in ((0, "placa_pare"), (90, "placa_preferencia"), (180, "placa_pare"), (270, "placa_preferencia")):
            p = rot((5.3, -5.3), g)
            importa(MOB, pid, cx + p[0], cy + p[1], g)
    # semáforos de pedestre nas faixas que chegam à praça
    importa(MOB, "traffic_light_003_pacote", -L + 5.2, H + 1.8, 90)
    importa(MOB, "traffic_light_003_pacote", -L - 5.2, H - 1.8, 90)
    importa(MOB, "traffic_light_003_pacote", H - 1.8, -L + 5.2, 0)
    importa(MOB, "traffic_light_003_pacote", H + 1.8, -L - 5.2, 0)
    importa(MOB, "placa_faixa_pedestres", L + 5.4, H - 4.5, 0)
    importa(MOB, "placa_faixa_pedestres", H + 4.5, L + 5.4, 90)
    importa(MOB, "placa_velocidade", L + 5.4, -H - 2.0, 0)
    # ---------------------------------------------------------------- calçadas
    for y in (-H - 3.0, H + 4.0):  # leste e oeste: postes na calçada de dentro, braço para a rua
        importa(MOB, "poste_rua", L - 4.6, y, 90)
        importa(MOB, "poste_rua", -L + 4.6, -y, -90)
    for x in (-H + 3.0, H - 4.0):
        importa(MOB, "poste_rua", x, L - 4.6, 180)
        importa(MOB, "poste_rua", -x, -L + 4.6, 0)
    importa(MOB, "ponto_onibus", L + 5.8, -H + 0.5, -90)
    importa(MOB, "trash_02_pacote", L + 5.6, -H - 2.4)
    importa(MOB, "bus_stop_02_pacote", -H, L + 5.9, 0)
    importa(MOB, "hidrante", L + 4.6, H + 3.8)
    importa(MOB, "caixa_correio", -L - 5.0, -H + 2.0, 90)
    importa(MOB, "telefone_publico", 3.0, -L - 5.3, 180)
    importa(MOB, "bicicletario", H + 4.6, Q + 1.9, 0)
    importa(MOB, "spotlight_01_pacote", -L - 4.6, H + 4.0, 90)
    for x, y, pid in ((L + 5.4, -12.5, "vaso_calcada"), (L + 5.6, 12.5, "arvore_redonda_pequena"),
                      (-12.5, L + 5.6, "arvore_redonda_pequena"), (12.0, -L - 5.6, "vaso_calcada"),
                      (-L - 5.6, -12.5, "arvore_redonda_pequena"), (-L - 5.4, 12.0, "vaso_calcada")):
        importa(VEG if pid != "x" else MOB, pid, x, y)
    bpy.context.view_layer.update()


def luzes_noturnas():
    """Uma luz pontual em cada grupo de faces `luz` (lâmpadas de poste, lanternas, luminárias)."""
    n = 0
    for cat, id_, raiz, novos in RAIZES:
        if not any(k in id_ for k in ("poste", "luminaria", "spotlight", "ponto_onibus", "relogio")):
            continue
        pts = []
        for o in novos:
            if o.type != "MESH" or o.hide_render:
                continue
            for p in o.data.polygons:
                m = o.data.materials[p.material_index] if p.material_index < len(o.data.materials) else None
                if m and m.name.split(".")[0] == "luz":
                    pts.append(o.matrix_world @ p.center)
        grupos = []
        for p in pts:
            for g in grupos:
                if (g[0] / g[1] - p).length < 0.7:
                    g[0] += p
                    g[1] += 1
                    break
            else:
                grupos.append([p.copy(), 1])
        for soma, k in grupos:
            c = soma / k
            ld = bpy.data.lights.new("lampada", "POINT")
            ld.energy = 900 if c.z > 6 else (160 if c.z > 2.5 else 35)
            ld.color = (1.0, 0.82, 0.55)
            ld.shadow_soft_size = 0.25
            ob = bpy.data.objects.new("lampada", ld)
            bpy.context.scene.collection.objects.link(ob)
            ob.location = c - V((0, 0, 0.2))
            n += 1
    print("luzes", n, flush=True)


def render(arquivo, noite=False, perto=False, res=(1800, 1300), amostras=40):
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
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.3 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_vitrine")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else
                                                                                         "#2A3D63"), 1)
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -0.42)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.35 if noite else 3.0
    if noite:
        ld.color = (0.6, 0.7, 1.0)
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
    if noite:
        luzes_noturnas()
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    if perto:  # a praça de rosácea e o caminho do sudeste, de perto
        lo, hi = V((-1.0, -15.0, 0.0)), V((16.0, 16.0, 6.0))
    else:
        lo, hi = V((-30.0, -30.0, 0.0)), V((30.0, 30.0, 8.0))
    pts = [V((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    c = (lo + hi) / 2
    d = V((0.55, -1.0, 0.85)).normalized()
    cam.location = c + d * 250
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.02
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cd.clip_end = 700
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    SAIDA = a[0]
    modos = [x for x in a[1:] if x in ("dia", "noite")] or ["dia", "noite"]
    vistas = [x for x in a[1:] if x in ("longe", "perto")] or ["longe", "perto"]
    _ = Matrix
    for modo in modos:
        for vista in vistas:
            RAIZES.clear()
            monta()
            nome = "teste_cena" + ("_perto" if vista == "perto" else "") + "_" + modo + ".png"
            arq = os.path.join(SAIDA, MOB, nome)
            render(arq, noite=modo == "noite", perto=vista == "perto")
            if vista == "longe":
                shutil.copy(arq, os.path.join(SAIDA, VEG, nome))
