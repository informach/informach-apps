"""Cena de exemplo da biblioteca de móveis: um quarto azul cheio de objetos, montado só com peças da biblioteca
(paredes e chão da construção, móveis e objetos dos catálogos).
Uso: blender-venv/bin/python -I cena_sala_moveis.py -- <moveis_out> <construcao> <saida.png> [blend]
AMOSTRAS e RES (largura) mudam a qualidade."""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

A = sys.argv[sys.argv.index("--") + 1:]
O, C, SAIDA = A[0], A[1], A[2]
BLEND = A[3] if len(A) > 3 else None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
CAT = {}
for c in os.listdir(O):
    f = os.path.join(O, c, "catalogo.json")
    if os.path.exists(f) and not c.startswith(("_", "teste")):
        for it in json.load(open(f))["itens"]:
            CAT[it["id"]] = (c, it)

YB, XL, XR, ALT = 1.825, -1.925, 1.925, 3.0  # face de dentro das paredes e altura do teto


def importa(arquivo):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=arquivo)
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None]
    if len(raiz) > 1:
        vazio = bpy.data.objects.new("grupo", None)
        scn.collection.objects.link(vazio)
        for r in raiz:
            r.parent = vazio
        return vazio, novos
    return raiz[0], novos


def abre(novos, t):
    for o in novos:
        d = o.get("interativo")
        if d == "porta":
            ax = Vector(o["eixo"])
            ax = Vector((ax[0], -ax[2], ax[1]))
            o.rotation_mode = "AXIS_ANGLE"
            o.rotation_axis_angle = (o["angulo"] * t, *ax)
        elif d in ("gaveta", "correr"):
            dd = Vector(o["direcao"])
            o.location += Vector((dd[0], -dd[2], dd[1])) * o["curso"] * t


def topo(x, y, ignorar=()):
    """Altura da superfície de cima no ponto (x, y): raio de cima para baixo."""
    dg = bpy.context.evaluated_depsgraph_get()
    z0 = ALT - 0.45  # abaixo das luminárias de teto
    while True:
        ok, loc, nrm, idx, ob, mat = scn.ray_cast(dg, Vector((x, y, z0)), Vector((0, 0, -1)))
        if not ok:
            return 0.0
        if ob.name in ignorar or ob.get("cena_fundo"):
            z0 = loc.z - 0.001
            continue
        return loc.z


def poe(id_, x, y, z=None, rot=0.0, esc=1.0, t_abre=0.0, sobre=False, giro_x=0.0, giro_y=0.0):
    """Coloca a peça: z explícito, ou sobre=True para pousar na superfície que estiver embaixo (x, y)."""
    cat, it = CAT[id_]
    raiz, novos = importa(os.path.join(O, cat, it["arquivo"]))
    if sobre:
        z = topo(x, y, {o.name for o in novos})
    raiz.location = (x, y, z or 0.0)
    raiz.rotation_mode = "XYZ"  # o importador de glTF deixa em quaternion
    raiz.rotation_euler = (math.radians(giro_x), math.radians(giro_y), math.radians(rot))
    raiz.scale = (esc, esc, esc)
    if t_abre:
        abre(novos, t_abre)
    bpy.context.view_layer.update()
    return raiz


# ------------------------------------------------------------------------------------------- paredes, chão e teto
def material_cor(nome, hexa, rug=0.8):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin(hexa), 1)
    b.inputs["Roughness"].default_value = rug
    return m


def material_tex(nome, arq):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    tx = m.node_tree.nodes.new("ShaderNodeTexImage")
    tx.image = bpy.data.images.load(arq)
    m.node_tree.links.new(tx.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    return m


parede_m = material_tex("parede_azul", os.path.join(C, "texturas", "degrade_azul.png"))
chao_m = material_cor("chao_azul", "#93B6E4", 0.7)
teto_m = material_cor("teto_azul", "#9CBDEB", 0.9)


def peca_construcao(id_, x, y, rot):
    raiz, novos = importa(os.path.join(C, "pecas", id_ + ".glb"))
    for o in novos:
        if o.type == "MESH":
            for i, m in enumerate(o.data.materials):
                n = m.name.split(".")[0] if m else ""
                if n in ("face_a", "face_b"):
                    o.data.materials[i] = parede_m
                elif n == "piso":
                    o.data.materials[i] = chao_m
    raiz.location = (x, y, 0)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (0, 0, math.radians(rot))
    for o in novos:
        o["cena_fundo"] = 1
    return raiz


EP = 0.075
peca_construcao("parede_4m", 2.0, YB + EP, 180)       # fundo
peca_construcao("parede_4m", XL - EP, YB + EP, -90)   # esquerda
peca_construcao("parede_4m", XR + EP, YB + EP - 4.0, 90)  # direita
ch, chn = importa(os.path.join(C, "pecas", "chao_4m.glb"))
for o in chn:
    o["cena_fundo"] = 1
    if o.type == "MESH":
        for i, m in enumerate(o.data.materials):
            if m and m.name.split(".")[0] == "piso":
                o.data.materials[i] = chao_m
bpy.context.view_layer.update()
lo, hi = mb.bbox([o for o in chn if o.type == "MESH"])
ch.location = (-(lo.x + hi.x) / 2, YB - (hi.y - lo.y) / 2 - (lo.y + hi.y) / 2 + 0.05, 0)
me = bpy.data.meshes.new("teto")
me.from_pydata([(-2.1, -2.3, ALT), (2.1, -2.3, ALT), (2.1, YB + 0.1, ALT), (-2.1, YB + 0.1, ALT)], [], [(0, 3, 2, 1)])
me.materials.append(teto_m)
teto = bpy.data.objects.new("teto", me)
teto["cena_fundo"] = 1
scn.collection.objects.link(teto)

# ----------------------------------------------------------------------------------------------- móveis grandes
poe("tapete_persa_medalhao", -0.05, 0.3)
poe("piano_armario_chocolate", 0.05, YB - 0.34)
poe("armario_cozinha_base_2portas_classica", XL + 0.31, 0.62, rot=90)
poe("armario_cozinha_ponta_curva_classica", XL + 0.31, 0.02, rot=90)
poe("cadeira_escritorio_rosa_pacote", -1.45, -0.55, rot=-55)
poe("cabideiro_pe_amarelo", -0.98, 0.95)
poe("banquinho_cubo_azul", -0.72, 1.0)
poe("mesa_centro_redonda_cinza_pacote", -0.72, 0.18, esc=0.85)
poe("halteres_par", -0.62, 0.2, rot=80, esc=1.25)
poe("planta_zamioculca", -0.12, 0.72)
poe("banqueta_degrau_roxa", 0.35, 0.05)
poe("cama_solteiro_classica_azul", 1.36, 0.75)
poe("banqueta_bar_giratoria_vermelha", 0.78, 0.2)
poe("bicicleta_ergometrica_pacote", 1.05, -0.55, rot=90)
poe("luminaria_chao_dupla", 1.62, 1.45)
poe("caixa_som_torre_azul", 1.72, -0.45, rot=-90)
poe("mesa_jantar_pes_chanfrados_vermelha", 1.4, -1.05, rot=90)
poe("tabua_passar_ferro", 1.55, -1.75, rot=-60)

# ------------------------------------------------------------------------------------------------ parede do fundo
poe("nicho_hexagonal_azul", -0.68, YB, 1.98)
poe("nicho_hexagonal_azul", -1.04, YB, 1.64)
poe("nicho_hexagonal_azul", -0.68, YB, 1.3)
poe("quadro_estrada_campo", -0.12, YB, 1.92)
poe("ar_condicionado", 1.12, YB, 2.42)
for k, q in enumerate(("quadro_pico_aurora", "quadro_colinas_douradas", "quadro_estrela")):
    poe(q, 0.56 + k * 0.42, YB, 1.72, esc=1.25)
poe("toalheiro_serpentina_branco", 0.62, YB, 0.98)
poe("alvo_dardos", 1.32, YB, 1.12)
poe("notas_adesivas_grupo", 1.05, YB, 0.82)
poe("nota_adesiva_amarela", 0.95, YB, 1.02, rot=0)

# ---------------------------------------------------------------------------------------------- parede esquerda
poe("espelho_parede_recortado", XL, -0.75, 1.15, rot=90)
poe("relogio_parede_redondo_azul", XL, 0.95, 1.95, rot=90)
poe("arandela_cupula", XL, 0.55, 1.62, rot=90)
poe("prateleira_maos_francesas_turquesa", XL, -0.05, 1.32, rot=90)
poe("desentupidor_laranja", XL + 0.02, 0.3, 2.42, giro_y=90)

# ----------------------------------------------------------------------------------------------- parede direita
poe("prateleira_maos_francesas_verde", XR, 1.2, 1.78, rot=-90)
poe("prateleira_parede_simples_branca", XR, 0.45, 1.42, rot=-90)

# ------------------------------------------------------------------------------------------------- teto
poe("plafon_disco", 0.0, 1.05, ALT, esc=1.7)

bpy.context.view_layer.update()
# ---------------------------------------------------------------------------------------- objetos sobre os móveis
# dentro dos nichos hexagonais
poe("planta_mini_cacto", -1.1, YB - 0.1, sobre=True)
poe("som_boombox", -0.98, YB - 0.1, sobre=True, esc=0.42)
poe("brinquedo_blocos", -0.68, YB - 0.1, sobre=True, esc=0.95)
poe("frasco_saboneteira_bomba_marrom", -0.68, YB - 0.1, sobre=True)
poe("frasco_xampu_amarelo", -0.74, YB - 0.1, sobre=True)
poe("frasco_spray_roxo", -0.6, YB - 0.1, sobre=True)
# em cima do piano
poe("cafeteira_expresso_vermelha", -0.5, YB - 0.24, sobre=True, esc=0.9)
poe("torradeira_turquesa", -0.18, YB - 0.24, sobre=True)
poe("som_micro_system", 0.4, YB - 0.2, sobre=True)
poe("brinquedo_bola_azul", 0.4, YB - 0.24, sobre=True, esc=0.95)
poe("tigela_terracota", 0.08, YB - 0.22, sobre=True)
# na tampa do teclado do piano
poe("livros_fileira_grande", 0.1, YB - 0.5, sobre=True)
poe("livros_pilha_cinco", -0.32, YB - 0.5, sobre=True)
poe("luminaria_mesa_articulada", -0.52, YB - 0.48, sobre=True, rot=20)
poe("brinquedo_tambor", 0.38, YB - 0.55, sobre=True, esc=0.75)
poe("espelho_camarim", 0.62, YB - 0.45, sobre=True, esc=0.6)
for k, (x, z) in enumerate(((-0.25, 1.0), (-0.05, 1.07), (0.18, 0.98))):
    poe("nota_adesiva_amarela" if k != 1 else "notas_adesivas_grupo", x, YB - 0.66, z, esc=0.9 if k == 1 else 1.0)
# na bancada da cozinha (parede esquerda)
poe("luminaria_lava", XL + 0.3, 0.42, sobre=True)
poe("copo_escovas_verde", XL + 0.25, 0.7, sobre=True)
poe("brinquedo_piao_pacote", XL + 0.38, 0.9, sobre=True, esc=0.6)
poe("xicara_pires_azul", XL + 0.35, 0.18, sobre=True)
poe("caneca_amarela", XL + 0.22, 0.05, sobre=True, rot=90)
# prateleiras de parede
poe("escorredor_pratos", XL + 0.12, -0.05, sobre=True, rot=90, esc=0.9)
poe("planta_mini_pileia", XR - 0.12, 1.35, sobre=True)
poe("bule_cafe_amarelo", XR - 0.11, 1.08, sobre=True, rot=-90)
poe("radio_portatil", XR - 0.1, 0.45, sobre=True, rot=-90, esc=0.7)
# mesa redonda, banquinho e mesa vermelha
poe("batedeira_planetaria_turquesa", -0.84, 0.2, sobre=True, rot=15)
poe("brinquedo_carrinho_pacote", -0.58, 0.08, sobre=True, rot=-20)
poe("planta_flores_vaso_turquesa", -0.95, 0.42, sobre=True)
poe("tv_tubo_pes_marrom", -0.72, 1.0, sobre=True, rot=8)
poe("tabua_corte_redonda", 0.35, 0.05, sobre=True, rot=90)
poe("panelas_empilhadas", 0.3, 0.02, sobre=True)
poe("balanca_cozinha_vermelha", -0.42, YB - 0.62, sobre=True, esc=0.9)
poe("brinquedo_argolas", 1.25, -0.95, sobre=True)
poe("rolo_massa_pacote", 1.45, -1.0, sobre=True, rot=70)
poe("planta_mini_tulipa", 1.5, -1.25, sobre=True)

# -------------------------------------------------------------------------------------------- luz, câmera, render
w = bpy.data.worlds.new("mundo")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#8FB6EA"), 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.5


def luz(nome, tipo, loc, energia, tam=1.0, cor="#FFFFFF", rot=(0, 0, 0)):
    ld = bpy.data.lights.new(nome, tipo)
    ld.energy = energia
    ld.color = mb._lin(cor)
    if tipo == "AREA":
        ld.size = tam
    ob = bpy.data.objects.new(nome, ld)
    scn.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


luz("teto", "AREA", (0, 0.2, ALT - 0.3), 260, 1.8, "#FFF1DC")
luz("plafon", "POINT", (0, 1.05, ALT - 0.32), 40, cor="#FFE6B8")
luz("frente", "AREA", (0, -3.6, 1.7), 380, 4.0, "#DCE8FF", rot=(math.radians(86), 0, 0))
cd = bpy.data.cameras.new("cam")
cd.lens = 22
cam = bpy.data.objects.new("cam", cd)
scn.collection.objects.link(cam)
cam.location = (0.0, -3.05, 1.3)
cam.rotation_euler = (math.radians(90), 0, 0)
cd.shift_y = 0.0
scn.camera = cam
scn.render.engine = "CYCLES"
scn.cycles.samples = int(os.environ.get("AMOSTRAS", "96"))
scn.cycles.use_denoising = True
scn.cycles.device = "CPU"
scn.render.threads_mode = "FIXED"
scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "4"))
largura = int(os.environ.get("RES", "2000"))
scn.render.resolution_x, scn.render.resolution_y = largura, int(largura * 9 / 16)
scn.view_settings.view_transform = "Standard"
scn.view_settings.exposure = float(os.environ.get("EXPOSICAO", "-0.35"))
scn.render.film_transparent = False
scn.render.filepath = SAIDA
bpy.ops.render.render(write_still=True)
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
print("cena", SAIDA, len([o for o in scn.objects if o.parent is None]))
