"""Teste de cena da categoria parque_brinquedos: um trecho de parque de 6 × 4 quadras com os brinquedos, caminhos de
piso (pisos), ruas (ruas) dos lados e prédios (predios_regulares, predios_magicos) do outro lado da rua, mais bancos,
postes, lixeiras e árvores das categorias vizinhas. Renderiza de dia e de noite e confere se cada peça cabe no lote.

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/parque_brinquedos_cena.py -- SP/cidade_out [dia|noite]
     [anim=t]  (anim=t põe os animados na posição do instante t, como a página)
Grava SP/cidade_out/parque_brinquedos/teste_cena_dia.png e teste_cena_noite.png.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
Q = 15.0
NX, NY = 8, 7
CAT = "parque_brinquedos"

# (categoria, id, i, j, giro, (nx, ny))  — coluna i de oeste para leste, linha j de sul para norte
PECAS = []
for _i in range(6):
    PECAS.append(("ruas", "rua_reta" if _i != 1 else "rua_reta_faixa_pedestres", _i, 1, 90, (1, 1)))
PECAS.append(("ruas", "rua_curva", 6, 1, 180, (1, 1)))
for _j in range(2, 7):
    PECAS.append(("ruas", "rua_reta", 6, _j, 0, (1, 1)))
PECAS += [
    # brinquedos que cobrem quadras inteiras
    (CAT, "montanha_russa_dragao", 0, 5, 0, (3, 2)),
    (CAT, "roda_gigante", 3, 6, 0, (2, 1)),
    (CAT, "montanha_russa_loopings", 3, 4, 0, (2, 2)),
    (CAT, "parque_aquatico", 3, 2, 0, (2, 2)),
    (CAT, "trenzinho_infantil", 0, 3, 0, (1, 1)),
    # pisos e caminhos
    ("pisos", "piso_praca", 0, 2, 0, (1, 1)), ("pisos", "piso_grama_caminho", 1, 2, 0, (1, 1)),
    ("pisos", "piso_grama_caminho", 1, 3, 0, (1, 1)), ("pisos", "piso_grama_caminho", 1, 4, 0, (1, 1)),
    ("pisos", "piso_praca", 2, 2, 0, (1, 1)), ("pisos", "piso_praca", 2, 3, 0, (1, 1)),
    ("pisos", "piso_grama", 0, 4, 0, (1, 1)), ("pisos", "piso_praca", 2, 4, 0, (1, 1)),
    ("pisos", "piso_ladrilho_rosado", 5, 2, 0, (1, 1)), ("pisos", "piso_grama", 5, 3, 0, (1, 1)),
    ("pisos", "piso_praca", 5, 4, 0, (1, 1)), ("pisos", "piso_grama", 5, 5, 0, (1, 1)),
    ("parque_areas", "palco_festival", 5, 6, 0, (1, 1)),
    # brinquedos soltos
    (CAT, "estatua_menina", 0, 2, 0, (1, 1)), (CAT, "carrossel", 2, 2, 0, (1, 1)),
    (CAT, "xicaras_malucas", 2, 3, 0, (1, 1)), (CAT, "carrinhos_bate_bate", 5, 2, -90, (1, 1)),
    (CAT, "barco_viking", 5, 3, 0, (1, 1)), (CAT, "torre_queda", 5, 4, 0, (1, 1)),
    ("parque_areas", "tenda_circo_media", 5, 5, 0, (1, 1)), ("parque_areas", "quiosque_algodao_doce", 2, 4, 0, (1, 1)),
]
# entrada do castelo na quadra (1, 2): portão sobre o caminho, torres dos lados e muretas para trás
CASTELO = [("castelo_portao", (0.0, -3.4), 0), ("castelo_torre_alta", (-4.9, -3.4), 0),
           ("castelo_torre_alta", (4.9, -3.4), 0), ("castelo_cone_telhado", (-4.9, -3.4), 0),
           ("castelo_cone_telhado", (4.9, -3.4), 0), ("castelo_mureta", (-5.4, 1.4), 90),
           ("castelo_mureta", (5.4, 1.4), 90), ("castelo_torre_baixa", (-5.4, 5.6), 0),
           ("castelo_torre_baixa", (5.4, 5.6), 0)]
PREDIOS = [
    ("predios_regulares", "loja_esquina_padaria", 0, 0, 180), ("predios_regulares", "sobrado_tijolo", 1, 0, 180),
    ("predios_regulares", "mercadinho", 2, 0, 180), ("predios_regulares", "casas_geminadas_pastel", 3, 0, 180),
    ("predios_regulares", "sobrado_bege", 4, 0, 180), ("predios_regulares", "lojas_2andares_flores", 5, 0, 180),
    ("predios_regulares", "loja_esquina_cafe", 6, 0, 180), ("predios_regulares", "casas_geminadas_tijolo", 7, 0, 180),
    ("predios_regulares", "apto_lilas_sacadas", 7, 1, -90), ("predios_magicos", "casa_cogumelo_vermelho", 7, 2, -90),
    ("predios_regulares", "casas_geminadas_pastel", 7, 3, -90), ("predios_magicos", "casa_arvore", 7, 4, -90),
    ("predios_regulares", "loja_esquina_cafe", 7, 5, -90), ("predios_regulares", "sobrado_bege", 7, 6, -90),
]


def centro(i, j, nx, ny):
    return (-NX * Q / 2 + Q * i + nx * Q / 2, -NY * Q / 2 + Q * j + ny * Q / 2)


def importa(caminho, pos, giro, z=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=caminho)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (pos[0], pos[1], z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
    return novos


def gl2b(v):
    return V((v[0], -v[2], v[1]))


def anima(t):
    """Põe os animados no instante t (girar, balançar e percurso), como a página."""
    for o in bpy.data.objects:
        a = o.get("anima")
        if a in ("girar", "balancar"):
            ax = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[o["eixo"]]
            ang = math.radians(o["velocidade"] * t) if a == "girar" else \
                math.radians(o["angulo"]) * math.sin(2 * math.pi * t / o["periodo"])
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = o.rotation_quaternion @ Quaternion(gl2b(ax), ang)
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.get("anima") != "percurso":
            continue
        P = [gl2b(p) for p in o["pontos"]]
        P.append(P[0])
        L = [0.0]
        for i in range(1, len(P)):
            L.append(L[-1] + (P[i] - P[i - 1]).length)
        tot = L[-1]

        def em(s):
            s = s % tot
            i = 1
            while i < len(L) - 1 and L[i] < s:
                i += 1
            f = (s - L[i - 1]) / max(1e-6, L[i] - L[i - 1])
            return P[i - 1].lerp(P[i], f)

        s = t * o["velocidade"] - o["atraso"]
        pai = o.parent.matrix_world
        pw, qw = pai @ em(s), pai @ em(s + 0.6)
        f = (qw - pw).normalized()
        x = V((0, 0, 1)).cross(f)
        x = x.normalized() if x.length > 1e-6 else V((1, 0, 0))
        yl = -f
        zl = x.cross(yl).normalized()
        o.matrix_world = Matrix(((x.x, yl.x, zl.x, pw.x), (x.y, yl.y, zl.y, pw.y), (x.z, yl.z, zl.z, pw.z),
                                 (0, 0, 0, 1)))
    bpy.context.view_layer.update()


def monta(saida, t_anim=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    relat = []
    for cat, id_, i, j, giro, n in PECAS:
        novos = importa(os.path.join(saida, cat, "glb", id_ + ".glb"), centro(i, j, *n), giro)
        if cat == CAT:
            relat.append((id_, i, j, n, novos))
    for cat, id_, i, j, giro in PREDIOS:
        importa(os.path.join(saida, cat, "glb", id_ + ".glb"), centro(i, j, 1, 1), giro)
    cx, cy = centro(1, 2, 1, 1)
    for id_, (x, y), giro in CASTELO:
        z = 0.0
        if id_ == "castelo_cone_telhado":
            z = 8.95  # em cima da torre alta (dentro das ameias)
        relat.append((id_, 1, 2, (1, 1), importa(os.path.join(saida, CAT, "glb", id_ + ".glb"), (cx + x, cy + y), giro, z)))
    # bancos, postes e lixeiras de praça, quiosques e árvores das categorias vizinhas
    extras = []
    pa = os.path.join(saida, "parque_areas", "glb")
    mu = os.path.join(saida, "mobiliario_urbano", "glb")
    ve = os.path.join(saida, "vegetacao", "glb")
    x1, y1 = centro(1, 3, 1, 1)
    for k, yy in enumerate((-4.5, 0.0, 4.5)):
        extras.append((os.path.join(mu, "banco_praca_madeira.glb"), (x1 - 2.2, y1 + yy), -90))
        extras.append((os.path.join(mu, "banco_praca_madeira.glb"), (x1 + 2.2, y1 + yy), 90))
    for yy in (-6.0, 2.2):
        extras.append((os.path.join(mu, "poste_praca_4_lanternas.glb"), (x1 - 2.4, y1 + yy), 0))
        extras.append((os.path.join(mu, "poste_praca_4_lanternas.glb"), (x1 + 2.4, y1 + yy), 0))
    extras.append((os.path.join(mu, "lixeira_reciclagem.glb"), (x1 + 2.3, y1 - 2.3), 90))
    extras.append((os.path.join(pa, "quiosque_pipoca.glb"), (x1 - 5.0, y1 - 1.0), 90))
    extras.append((os.path.join(pa, "quiosque_sorvete.glb"), (x1 + 5.0, y1 + 1.5), -90))
    for (x, y) in ((x1 - 5.2, y1 + 5.0), (x1 + 5.2, y1 - 5.0)):
        extras.append((os.path.join(ve, "arvore_redonda_media.glb"), (x, y), 0))
    x2, y2 = centro(1, 2, 1, 1)
    for (x, y) in ((x2 - 5.5, y2 + 2.5), (x2 + 5.5, y2 + 2.5)):
        extras.append((os.path.join(ve, "arvore_florida_rosa.glb"), (x, y), 0))
    xs, ys = centro(0, 2, 1, 1)
    for (dx, dy) in ((-5.6, -5.6), (5.6, -5.6), (-5.6, 5.6), (5.6, 5.6)):
        extras.append((os.path.join(mu, "poste_praca_4_lanternas.glb"), (xs + dx, ys + dy), 0))
    for (dx, dy) in ((-4.0, 0.0), (4.0, 0.0)):
        extras.append((os.path.join(mu, "banco_praca_madeira.glb"), (xs + dx, ys + dy - 3.6), 0))
    for (cx_, cy_) in (centro(2, 2, 1, 1), centro(2, 3, 1, 1), centro(5, 4, 1, 1)):
        for (dx, dy) in ((-6.4, -6.4), (6.4, 6.4)):
            extras.append((os.path.join(mu, "poste_praca_4_lanternas.glb"), (cx_ + dx, cy_ + dy), 0))
    for (cx_, cy_) in (centro(5, 3, 1, 1),):
        for (dx, dy) in ((-6.3, -6.3), (6.3, -6.3), (-6.3, 6.3), (6.3, 6.3)):
            extras.append((os.path.join(ve, "palm_03_pacote.glb"), (cx_ + dx, cy_ + dy), 0))
    for arq, pos, giro in extras:
        if os.path.exists(arq):
            importa(arq, pos, giro)
        else:
            print("sem", arq, flush=True)
    bpy.context.view_layer.update()
    for id_, i, j, n, novos in relat:
        pts = [o.matrix_world @ v.co for o in novos if o.type == "MESH" and not o.get("colisao") for v in o.data.vertices]
        lo = V([min(p[k] for p in pts) for k in range(3)])
        hi = V([max(p[k] for p in pts) for k in range(3)])
        x0 = -NX * Q / 2 + Q * i
        y0 = -NY * Q / 2 + Q * j
        cabe = lo.x >= x0 - 0.05 and hi.x <= x0 + n[0] * Q + 0.05 and lo.y >= y0 - 0.05 and hi.y <= y0 + n[1] * Q + 0.05
        print(f"lote {id_}: x {lo.x - x0:+.2f}..{hi.x - x0:+.2f}  y {lo.y - y0:+.2f}..{hi.y - y0:+.2f}  "
              f"z {lo.z:.2f}..{hi.z:.2f}  {'cabe' if cabe else 'NAO CABE'}", flush=True)
    if t_anim is not None:
        anima(t_anim)


def render(arquivo, noite=False, res=(2200, 1500), amostras=40):
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
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.45 if noite else 0.6
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
    ob.location = (0, 0, -0.42)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.6 if noite else 3.0
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
    d = V((0.42, -1.0, 0.95)).normalized()
    alvo = V((-2.0, 6.0, 8.0))
    cam.location = alvo + d * 300
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.ortho_scale = 136
    cd.clip_end = 800
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    saida = args[0]
    modos = [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"]
    t = 2.5
    for a in args[1:]:
        if a.startswith("anim="):
            t = float(a[5:])
    for md in modos:
        monta(saida, t)
        render(os.path.join(saida, CAT, f"teste_cena_{md}.png"), noite=md == "noite")
