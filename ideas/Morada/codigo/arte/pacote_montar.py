"""Teste do pacote modular (IT Happy Studios, versões grátis): monta um personagem com peças de pacotes
diferentes, recolore pela paleta, cria expressões no rosto e passa animações Mixamo para o esqueleto do pacote.

Uso: python pacote_montar.py <clipes.blend> <saida_dir>
"""
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

LIB, OUT = sys.argv[1], os.path.abspath(sys.argv[2])
os.makedirs(OUT, exist_ok=True)
AQUI = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.dirname(AQUI)
P1 = os.path.join(SCR, "pacote", "fbx")
P2 = os.path.join(SCR, "pacote2", "fbx", "Apocalypse_Free_fbx", "Characters")
PALETA = os.path.join(SCR, "pacote2", "tex", "textures", "Color2.png")

# ------------------------------------------------------------------ 1. importar e escolher as peças
bpy.ops.wm.read_factory_settings(use_empty=True)


def importar(caminho):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=caminho)
    return [o for o in bpy.data.objects if o not in antes]


lenhador = importar(os.path.join(P2, "Adult_Woodcutter.fbx"))
arm = next(o for o in lenhador if o.type == "ARMATURE")
arm.name = "pai_esqueleto"
criativo = importar(os.path.join(P1, "Creative_Character_free.fbx"))
arm_c = next(o for o in criativo if o.type == "ARMATURE")

PECAS = {  # nome no pacote -> papel
    "Adult_Male_Body": "corpo", "Adult_Male_Face_Usual": "rosto", "Beard_Male": "barba",
    "Hairstyle_Single_Male": "cabelo", "Outwear_Adult_Male": "camisa_xadrez", "Pants_Adult_Male": "calca",
    "T_Shirt_009": "camiseta", "Shoe_Sneakers_009": "tenis",
}
pecas = {}
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
    papel = PECAS.get(o.name)
    if papel is None:
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    pecas[papel] = o
for o in pecas.values():  # peças do outro pacote passam para o esqueleto do lenhador (mesmos ossos)
    if o.parent == arm_c:
        mw = o.matrix_world.copy()
        o.parent = arm
        o.matrix_world = mw
        for m in o.modifiers:
            if m.type == "ARMATURE":
                m.object = arm
bpy.data.objects.remove(arm_c, do_unlink=True)
for a in list(bpy.data.actions):
    if not a.name.startswith("Adult_Woodcutter"):
        bpy.data.actions.remove(a)
print("peças", {k: v.name for k, v in pecas.items()})

# texturas que o FBX aponta para o disco do autor (G:/...) passam a vir da pasta do pacote
TEX2 = os.path.join(SCR, "pacote2", "tex", "textures")
for im in bpy.data.images:
    c_ = os.path.join(TEX2, os.path.basename(im.filepath.replace("\\", "/")))
    if os.path.exists(c_):
        im.filepath = c_
        im.reload()

# ------------------------------------------------------------------ 2. material único com a paleta
img = bpy.data.images.load(PALETA)
PAL = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)[..., :3]
mat = bpy.data.materials.new("paleta")
mat.use_nodes = True
b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
b.inputs["Roughness"].default_value = 0.8
t = mat.node_tree.nodes.new("ShaderNodeTexImage")
t.image = img
mat.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
for papel, o in pecas.items():
    if papel == "camisa_xadrez":  # o xadrez tem textura própria; só o material liso (gola, botões) vira paleta
        for k_, m_ in enumerate(o.data.materials):
            if m_ and m_.name.startswith("Color"):
                o.data.materials[k_] = mat
        continue
    o.data.materials.clear()
    o.data.materials.append(mat)


def cor_uv(u, v):
    return PAL[min(PAL.shape[0] - 1, int(v * PAL.shape[0])), min(PAL.shape[1] - 1, int(u * PAL.shape[1]))]


def recolorir(o, hexcor):
    """Muda a cor da peça escolhendo outro ponto da paleta: o UV inteiro da peça é levado para o pixel da
    paleta mais parecido com a cor pedida (as variações de sombra da peça ficam em volta dele)."""
    alvo = np.array([int(hexcor[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    lin = np.where(alvo <= 0.04045, alvo / 12.92, ((alvo + 0.055) / 1.055) ** 2.4)
    d = ((PAL - lin) ** 2).sum(2)
    y, x = np.unravel_index(np.argmin(d), d.shape)
    uv_alvo = np.array([(x + 0.5) / PAL.shape[1], (y + 0.5) / PAL.shape[0]])
    uvl = o.data.uv_layers.active.data
    me_ = o.data
    # a paleta tem uma coluna por cor (x) e o claro/escuro na altura (y). A cor principal da peça é a coluna
    # que cobre mais área; todas as faces dessa coluna andam juntas para a coluna/altura da cor pedida,
    # e as sombras (outras alturas da mesma coluna) acompanham. Detalhes de outras cores ficam como estão.
    us, vs, areas = [], [], []
    for p_ in me_.polygons:
        us.append(np.mean([uvl[i].uv[0] for i in p_.loop_indices]))
        vs.append(np.mean([uvl[i].uv[1] for i in p_.loop_indices]))
        areas.append(p_.area)
    us, vs, areas = np.array(us), np.array(vs), np.array(areas)
    col = np.floor(us / 0.04).astype(int)
    principal = np.argmax(np.bincount(col - col.min(), weights=areas)) + col.min()
    sel = np.abs(us - (principal + 0.5) * 0.04) < 0.04
    u0 = np.average(us[sel], weights=areas[sel])
    v0 = np.average(vs[sel], weights=areas[sel])
    # a paleta tem duas metades (suave em cima, viva embaixo): o claro/escuro fica dentro da metade da cor pedida
    lo, hi = (0.505, 0.995) if uv_alvo[1] >= 0.5 else (0.005, 0.495)
    for p_, ok in zip(me_.polygons, sel):
        if not ok:
            continue
        for i in p_.loop_indices:
            u, v = uvl[i].uv
            uvl[i].uv = (uv_alvo[0] + (u - u0) * 0.3, min(hi, max(lo, uv_alvo[1] + (v - v0) * 0.5)))


bpy.data.objects.remove(pecas.pop("camiseta"), do_unlink=True)  # a camiseta do outro corpo ficava por cima do xadrez


def tingir_tecido(o, deslocar_matiz, nome):
    """Tecido estampado (ex.: xadrez) muda de cor girando o matiz da textura dele (o desenho fica igual)."""
    from PIL import Image
    for m in o.data.materials:
        if not m or not m.node_tree:
            continue
        for n_ in m.node_tree.nodes:
            if n_.type == "TEX_IMAGE" and n_.image and "Fabric" in n_.image.name:
                im = Image.open(bpy.path.abspath(n_.image.filepath)).convert("RGB").convert("HSV")
                h, s_, v = im.split()
                h = h.point(lambda x: (x + int(deslocar_matiz * 255)) % 256)
                destino = os.path.join(OUT, nome + ".png")
                Image.merge("HSV", (h, s_, v)).convert("RGB").save(destino)
                n_.image = bpy.data.images.load(destino)


tingir_tecido(pecas["camisa_xadrez"], 0.6, "xadrez_azul")
recolorir(pecas["calca"], "#2E3D63")
recolorir(pecas["tenis"], "#F4F4F2")
recolorir(pecas["cabelo"], "#3A2516")
recolorir(pecas["barba"], "#3A2516")

# ------------------------------------------------------------------ 3. expressões no rosto (shape keys)
rosto = pecas["rosto"]
bm = bmesh.new()
bm.from_mesh(rosto.data)
bm.verts.ensure_lookup_table()
vis, ilhas = set(), []
for v in bm.verts:
    if v in vis:
        continue
    pilha, ilha = [v], []
    while pilha:
        x = pilha.pop()
        if x in vis:
            continue
        vis.add(x)
        ilha.append(x.index)
        pilha += [e.other_vert(x) for e in x.link_edges]
    ilhas.append(ilha)
bm.free()
CO = np.array([tuple(v.co) for v in rosto.data.vertices])
mw = rosto.matrix_world
W = np.array([tuple(mw @ v.co) for v in rosto.data.vertices])
alt = {k: W[il][:, 2].mean() for k, il in enumerate(ilhas)}
ordem = sorted(range(len(ilhas)), key=lambda k: alt[k])
boca = [ordem[0]]
olhos = [k for k in ordem[1:] if abs(alt[k] - alt[ordem[1]]) < 0.01]
sobr = [k for k in ordem[1:] if k not in olhos]
print("rosto: boca", boca, "olhos", olhos, "sobrancelhas", sobr)
inv = mw.inverted()


def chave(nome, fn):
    k = rosto.shape_key_add(name=nome, from_mix=False)
    Y = W.copy()
    fn(Y)
    k.data.foreach_set("co", np.array([tuple(inv @ Vector(p)) for p in Y], np.float32).ravel())
    k.value = 0.0


def escalar(Y, ids, sx, sz, dz=0.0, pivo_z=None):
    c = Y[ids].mean(0)
    pz = c[2] if pivo_z is None else pivo_z
    Y[ids, 0] = c[0] + (Y[ids, 0] - c[0]) * sx
    Y[ids, 2] = pz + (Y[ids, 2] - pz) * sz + dz


if rosto.data.shape_keys is None:
    rosto.shape_key_add(name="Basis")
olhos_ids = [i for k in olhos for i in ilhas[k]]
chave("piscar", lambda Y: [escalar(Y, ilhas[k], 1.1, 0.08, pivo_z=W[ilhas[k]][:, 2].min() + 0.004) for k in olhos])
chave("sobr_sobe", lambda Y: [escalar(Y, ilhas[k], 1.0, 1.0, dz=0.008) for k in sobr])


def sobr_brava(Y):
    for k in sobr:
        ids = ilhas[k]
        c = Y[ids].mean(0)
        dentro = -np.sign(c[0])
        Y[ids, 2] += -0.004 - (Y[ids, 0] - c[0]) * dentro * 0.35  # canto de dentro desce
chave("sobr_brava", sobr_brava)


def sobr_triste(Y):
    for k in sobr:
        ids = ilhas[k]
        c = Y[ids].mean(0)
        dentro = -np.sign(c[0])
        Y[ids, 2] += 0.002 + (Y[ids, 0] - c[0]) * dentro * 0.3  # canto de dentro sobe
chave("sobr_triste", sobr_triste)
chave("boca_abre", lambda Y: escalar(Y, ilhas[boca[0]], 0.7, 3.2))
chave("boca_o", lambda Y: escalar(Y, ilhas[boca[0]], 0.35, 2.6))
chave("boca_larga", lambda Y: escalar(Y, ilhas[boca[0]], 1.25, 0.8))

# ------------------------------------------------------------------ 4. animações Mixamo no esqueleto do pacote
with bpy.data.libraries.load(LIB, link=False) as (src, dst):
    dst.objects = ["Esqueleto"]
    dst.actions = [a for a in src.actions if a in ("clapping", "talking_on_a_cell_phone", "hip_hop_dancing", "walking")]
ch = dst.objects[0]
bpy.context.scene.collection.objects.link(ch)
bpy.context.view_layer.update()  # sem isso a matrix_world do esqueleto ainda é a identidade (falta a escala 0,01)
MAPA = {"Hips": "Hips", "Spine": "Spine", "Spine1": "Spine1", "Spine2": None, "Neck": "Neck", "Head": "Head"}
for lado in ("Left", "Right"):
    for n in ("Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase"):
        MAPA[lado + n] = lado + n
P = "mixamorig:"


def rest_mundo(o, nome):
    return (o.matrix_world @ o.data.bones[nome].matrix_local).to_quaternion()


def retarget(acao):
    """Copia a rotação no espaço do mundo, osso a osso, com o desvio de repouso entre os dois esqueletos.
    O Spine2 do Mixamo (que o pacote não tem) é somado ao Spine1. O quadril anda na escala da altura."""
    ch.animation_data_create()
    ch.animation_data.action = acao
    if hasattr(ch.animation_data, "action_slot") and acao.slots:
        ch.animation_data.action_slot = acao.slots[0]
    nova = bpy.data.actions.new(f"pai|{acao.name}")
    arm.animation_data_create()
    arm.animation_data.action = nova
    escala = (arm.matrix_world @ arm.data.bones["Hips"].head_local).z / (ch.matrix_world @ ch.data.bones[P + "Hips"].head_local).z
    h0_src = ch.matrix_world @ ch.data.bones[P + "Hips"].head_local
    h0_dst = arm.matrix_world @ arm.data.bones["Hips"].head_local
    desvio = {}
    for s_, d_ in MAPA.items():
        if d_:
            desvio[d_] = rest_mundo(ch, P + s_).inverted() @ rest_mundo(arm, d_)
    f0, f1 = (int(x) for x in acao.frame_range)
    ordem_ossos = sorted([d for d in MAPA.values() if d], key=lambda n: len(arm.pose.bones[n].parent_recursive))
    inv_src = {v: k for k, v in MAPA.items() if v}
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        for d_ in ordem_ossos:
            s_ = inv_src[d_]
            pb_s = ch.pose.bones[P + s_]
            q_mundo = (ch.matrix_world @ pb_s.matrix).to_quaternion()
            if d_ == "Spine1":  # leva junto a curvatura do Spine2
                q_mundo = (ch.matrix_world @ ch.pose.bones[P + "Spine2"].matrix).to_quaternion()
            alvo = q_mundo @ desvio[d_]
            pb = arm.pose.bones[d_]
            M = arm.matrix_world.inverted().to_quaternion() @ alvo
            pos = pb.matrix.translation.copy()
            if d_ == "Hips":
                hs = ch.matrix_world @ pb_s.matrix.translation
                pos = arm.matrix_world.inverted() @ (h0_dst + (hs - h0_src) * escala)
            pb.matrix = Matrix.Translation(pos) @ M.to_matrix().to_4x4()
            bpy.context.view_layer.update()
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if d_ == "Hips":
                pb.keyframe_insert("location", frame=f)
    arm.animation_data.action = None
    nova.use_fake_user = True
    return nova


for pb in arm.pose.bones:
    pb.rotation_mode = "QUATERNION"
novas = [retarget(a) for a in dst.actions]
bpy.data.objects.remove(ch, do_unlink=True)
for a in dst.actions:
    bpy.data.actions.remove(a)
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix()

# todas as animações em faixas NLA (as do pacote e as convertidas)
ad = arm.animation_data or arm.animation_data_create()
ad.action = None
for a in bpy.data.actions:
    tr = ad.nla_tracks.new()
    tr.name = a.name.split("|")[-1].replace("AC_Adult_", "")
    st = tr.strips.new(tr.name, int(a.frame_range[0]), a)
    if hasattr(st, "action_slot") and st.action_slot is None and a.slots:
        st.action_slot = a.slots[0]
    tr.mute = True
tri = 0
for o in pecas.values():
    o.data.calc_loop_triangles()
    tri += len(o.data.loop_triangles)
print("triângulos", tri, "animações", [t.name for t in ad.nla_tracks])
bpy.ops.file.pack_all()  # texturas dentro do .blend (nada de caminho quebrado depois)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "pai_pacote.blend"))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "pai_pacote.glb"), export_format="GLB", export_animations=True,
                          export_animation_mode="NLA_TRACKS", export_morph=True, export_image_format="WEBP")
print("ok")
