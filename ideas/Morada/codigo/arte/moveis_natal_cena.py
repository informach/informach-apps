"""Cena de sala de Natal montada só com as peças da categoria natal (o pacote Christmas Pack): piso de biscoito,
duas paredes de biscoito com janelas, lareira acesa com meias, árvore com presentes, sofá, poltronas, mesa de centro
com chá e biscoitos, pisca-pisca e guirlandas. À noite, com as luzes acesas.
Uso: blender-venv/bin/python -I morada-art/moveis_natal_cena.py -- SP/moveis_out SP/moveis_out/natal/cena_natal.png [dia]
AMOSTRAS e RES (largura) mudam a qualidade."""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

A = sys.argv[sys.argv.index("--") + 1:]
O, SAIDA = A[0], A[1]
DIA = "dia" in A[2:]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moveis_base as mb  # noqa: E402

V = Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
PASTA = os.path.join(O, "natal")
CAT = {i["id"]: i for i in json.load(open(os.path.join(PASTA, "catalogo.json")))["itens"]}


def importa(arquivo):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=arquivo)
    novos = [o for o in bpy.data.objects if o not in antes]
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
            o.hide_set(True)
    raiz = [o for o in novos if o.parent is None][0]
    return raiz, [o for o in novos if not o.get("colisao")]


def poe(id_, x, y, z=0.0, rot=0.0, esc=1.0, sobre=False):
    raiz, novos = importa(os.path.join(PASTA, CAT[id_]["arquivo"]))
    if sobre:
        z = topo(x, y, {o.name for o in novos})
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (0, 0, math.radians(rot))
    raiz.scale = (esc, esc, esc)
    bpy.context.view_layer.update()
    return raiz


def topo(x, y, ignorar=(), z0=2.6):
    dg = bpy.context.evaluated_depsgraph_get()
    while True:
        ok, loc, nrm, idx, ob, mat = scn.ray_cast(dg, V((x, y, z0)), V((0, 0, -1)))
        if not ok:
            return 0.0
        if ob.name in ignorar or ob.hide_render:
            z0 = loc.z - 0.001
            continue
        return loc.z


def bate(origem, direcao):
    """Primeiro ponto atingido a partir de origem na direção dada (para encostar enfeites em paredes)."""
    dg = bpy.context.evaluated_depsgraph_get()
    o = V(origem)
    while True:
        ok, loc, nrm, idx, ob, mat = scn.ray_cast(dg, o, V(direcao).normalized())
        if not ok:
            return None
        if ob.hide_render:
            o = loc + V(direcao).normalized() * 0.001
            continue
        return loc


# ------------------------------------------------------------------------------------- piso e paredes de biscoito
piso = poe("piso_natal_biscoito_glace_pacote", 0, 0)
Z0 = topo(0, 0)
EP = CAT["parede_biscoito_lateral_duas_janelas_pacote"]["dims"][1]
YB = 1.95  # face de dentro da parede do fundo
XL = -2.3  # face de dentro da parede da esquerda
fundo = poe("parede_biscoito_lateral_duas_janelas_pacote", 0.05, YB + EP / 2, Z0 - 0.12)
esq = poe("parede_biscoito_lateral_janela_pacote", XL - EP / 2, -0.3, Z0 - 0.12, rot=90)
# janelas nos vãos (medidos com raios na parede pronta)


def vaos(parede, eixo):
    """Vãos fechados da parede (janelas), por raios na grade da parede, nas coordenadas do mundo."""
    lo, hi = mb.bbox([o for o in parede.children_recursive if o.type == "MESH" and not o.hide_render] + [parede])
    passo = 0.05
    livres = []
    if eixo == "x":
        us = [lo.x + (i + 0.5) * passo for i in range(int((hi.x - lo.x) / passo))]
    else:
        us = [lo.y + (i + 0.5) * passo for i in range(int((hi.y - lo.y) / passo))]
    zs = [lo.z + (k + 0.5) * passo for k in range(int((hi.z - lo.z) / passo))]
    for i, u in enumerate(us):
        for k, z in enumerate(zs):
            if eixo == "x":
                o, d = V((u, lo.y - 0.5, z)), V((0, 1, 0))
            else:
                o, d = V((lo.x - 0.5, u, z)), V((1, 0, 0))
            p = bate(o, d)
            if p is None or (p.y > hi.y + 0.01 if eixo == "x" else p.x > hi.x + 0.01):
                livres.append((i, k))
    L = set(livres)
    vis, comps = set(), []
    for c in livres:
        if c in vis:
            continue
        pil, comp = [c], []
        vis.add(c)
        while pil:
            q = pil.pop()
            comp.append(q)
            for dd in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                r = (q[0] + dd[0], q[1] + dd[1])
                if r in L and r not in vis:
                    vis.add(r)
                    pil.append(r)
        comps.append(comp)
    out = []
    for comp in comps:
        iis = [q[0] for q in comp]
        ks = [q[1] for q in comp]
        if min(iis) == 0 or max(iis) == len(us) - 1 or min(ks) == 0 or max(ks) == len(zs) - 1 or len(comp) < 40:
            continue
        out.append(((us[min(iis)] + us[max(iis)]) / 2, (zs[min(ks)] + zs[max(ks)]) / 2,
                    us[max(iis)] - us[min(iis)] + passo, zs[max(ks)] - zs[min(ks)] + passo))
    return out


bpy.context.view_layer.update()
JAN = CAT["janela_natal_quadrada_pacote"]["dims"]
VF = vaos(fundo, "x")
VE = vaos(esq, "y")
print("vaos fundo", [[round(v, 2) for v in q] for q in VF], "esquerda", [[round(v, 2) for v in q] for q in VE])
for u, zc, w, h in VF:
    poe("janela_natal_quadrada_pacote", u, YB + EP / 2, zc - JAN[2] / 2)
for u, zc, w, h in VE:
    poe("janela_natal_quadrada_pacote", XL - EP / 2, u, zc - JAN[2] / 2, rot=90)

# ------------------------------------------------------------------------------------------------ móveis grandes
poe("tapete_natal_retangular_pacote", 0.15, 0.55, Z0)
poe("tapete_natal_oval_pacote", -1.55, -0.55, Z0 + 0.002, rot=90, esc=0.75)
lar_y = -0.55
lar = poe("lareira_natal_acesa_chamine_pacote", XL + CAT["lareira_natal_acesa_chamine_pacote"]["dims"][1] / 2, lar_y,
          Z0, rot=90)
sofa_y = YB - CAT["sofa_natal_dois_lugares_laranja_pacote"]["dims"][1] / 2 - 0.04
poe("sofa_natal_dois_lugares_laranja_pacote", 0.0, sofa_y, Z0)
poe("arvore_natal_interna_enfeitada_pacote", 1.55, 1.25, Z0)
poe("poltrona_natal_estofada_marrom_pacote", -1.35, 1.05, Z0, rot=35)
poe("poltrona_natal_bracos_madeira_pacote", 1.6, -0.95, Z0, rot=-110)
poe("mesa_centro_natal_redonda_pacote", 0.05, 0.45, Z0)
poe("pufe_natal_saco_vermelho_pacote", -0.55, -1.45, Z0, rot=40, esc=0.75)
poe("luminaria_natal_chao_cupula_pacote", -1.05, YB - 0.3, Z0)
poe("papai_noel_boneco_natal_pacote", 2.15, 0.45, Z0, rot=-60)
poe("lenha_lareira_natal_pacote", XL + 0.3, 0.45, Z0, rot=15)
bpy.context.view_layer.update()

# ------------------------------------------------------------------------------------- presentes embaixo da árvore
for id_, x, y, r in (("presente_natal_roxo_fita_azul_pacote", 1.05, 0.95, 15),
                     ("presente_natal_vermelho_fita_verde_pacote", 1.45, 0.55, -20),
                     ("presente_natal_azul_fita_amarela_pacote", 0.95, 0.5, 30),
                     ("presente_natal_verde_fita_laranja_pacote", 1.8, 0.62, 5),
                     ("presente_natal_laranja_fita_vermelha_pacote", 2.0, 1.0, -35),
                     ("presente_natal_verde_fita_amarela_pacote", 0.62, 1.38, 40)):
    poe(id_, x, y, Z0, rot=r)

# --------------------------------------------------------------------------------------- lareira: meias e guirlanda
DL = CAT["lareira_natal_acesa_chamine_pacote"]["dims"]
xf = XL + DL[1]  # frente da lareira
zc = Z0 + 1.16 * 0.94  # topo da cornija
for k, dy in enumerate((-0.38, 0.0, 0.38)):
    p = bate((xf + 0.5, lar_y + dy, zc - 0.06), (-1, 0, 0))
    poe("meia_natal_vermelha_pacote", p.x + 0.002, lar_y + dy, zc - 0.06 - CAT["meia_natal_vermelha_pacote"]["dims"][2],
        rot=90)
p = bate((xf + 0.5, lar_y, Z0 + 1.75), (-1, 0, 0))
poe("guirlanda_natal_redonda_laco_pacote", p.x + 0.003, lar_y, Z0 + 1.5, rot=90)
bpy.context.view_layer.update()

# ------------------------------------------------------------------------------------------- paredes: enfeites
poe("pisca_pisca_natal_cordao_pacote", XL, 0.0, Z0 + 2.45, rot=90)
if VF:
    u, zc_, w, h = VF[0]
    poe("guirlanda_natal_festao_laco_pacote", u, YB - 0.01, zc_ + h / 2 + 0.06)
    if len(VF) > 1:
        u2, zc2, w2, h2 = VF[1]
        poe("guirlanda_natal_festao_laco_pacote", u2, YB - 0.01, zc2 + h2 / 2 + 0.06)
poe("relogio_natal_pendulo_parede_pacote", 0.22, YB, Z0 + 1.32)
poe("quadro_natal_pinheiro_pacote", XL, 1.2, Z0 + 1.25, rot=90)
bpy.context.view_layer.update()

# ------------------------------------------------------------------------------------ objetos em cima das coisas
poe("chaleira_natal_pacote", 0.12, 0.42, sobre=True)
poe("xicara_natal_grafite_pacote", -0.18, 0.6, sobre=True, rot=30)
poe("xicara_natal_grafite_pacote", 0.3, 0.68, sobre=True, rot=-60)
poe("prato_natal_fundo_pacote", -0.12, 0.25, sobre=True)
bpy.context.view_layer.update()
for k, (dx, dy, r) in enumerate(((-0.03, 0.0, 10), (0.04, 0.03, 80), (0.0, -0.04, -30))):
    poe("biscoito_natal_palito_pacote" if k != 1 else "biscoitos_natal_dois_pacote", -0.12 + dx, 0.25 + dy,
        sobre=True, rot=r)
poe("almofada_natal_verde_pacote", -0.45, sofa_y + 0.05, sobre=True, rot=170)
poe("almofada_natal_vermelha_pacote", 0.45, sofa_y + 0.05, sobre=True, rot=190)
poe("livros_natal_pilha_pacote", 0.35, -1.6, Z0, rot=20)
poe("cartas_natal_papel_pacote", 0.3, 0.3, sobre=True, rot=15)
bpy.context.view_layer.update()

# ------------------------------------------------------------------------------------------------- luz e câmera
mb.emissao_janelas(0.0 if DIA else mb.JANELA_FORCA * 1.4)
w = bpy.data.worlds.new("w")
scn.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#9DB4D9" if DIA else "#1B2A4A"), 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.8 if DIA else 0.35


def luz(nome, tipo, pos, energia, cor, raio=0.1):
    ld = bpy.data.lights.new(nome, tipo)
    ld.energy = energia
    ld.color = cor
    if tipo == "POINT":
        ld.shadow_soft_size = raio
    ob = bpy.data.objects.new(nome, ld)
    scn.collection.objects.link(ob)
    ob.location = pos
    return ob


sol = luz("sol", "SUN", (0, 0, 10), 2.6 if DIA else 0.25, (1, 0.97, 0.92) if DIA else (0.6, 0.7, 1.0))
sol.rotation_euler = (math.radians(50), 0, math.radians(-30))
if not DIA:
    luz("fogo", "POINT", (xf + 0.25, lar_y, Z0 + 0.45), 260, (1.0, 0.55, 0.22), 0.25)
    luz("abajur", "POINT", (-1.05, YB - 0.3, Z0 + 1.3), 110, (1.0, 0.82, 0.55), 0.15)
    luz("arvore", "POINT", (1.55, 0.85, Z0 + 1.1), 90, (1.0, 0.85, 0.55), 0.4)
    luz("ambiente", "AREA", (0.6, -2.5, Z0 + 3.2), 90, (1.0, 0.86, 0.7))
else:
    luz("ambiente", "AREA", (0.6, -2.5, Z0 + 3.2), 150, (1.0, 0.97, 0.92))
amb = bpy.data.objects["ambiente"]
amb.data.size = 3.0
amb.rotation_euler = (math.radians(55), 0, 0)

cd = bpy.data.cameras.new("cam")
cd.lens = 27
cam = bpy.data.objects.new("cam", cd)
scn.collection.objects.link(cam)
scn.camera = cam
cam.location = (2.5, -5.0, Z0 + 3.3)
alvo = V((-0.25, 0.35, Z0 + 0.85))
cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.engine = "CYCLES"
scn.cycles.samples = int(os.environ.get("AMOSTRAS", 64))
scn.cycles.use_denoising = True
scn.render.threads_mode = "FIXED"
scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
scn.render.resolution_x = int(os.environ.get("RES", 1600))
scn.render.resolution_y = int(scn.render.resolution_x * 0.625)
scn.view_settings.view_transform = "Standard"
scn.render.image_settings.file_format = "PNG"
scn.render.filepath = SAIDA
bpy.ops.render.render(write_still=True)
print("cena", SAIDA, flush=True)
