"""GLB animados dos efeitos visuais do Morada (Blender 5 como módulo).

Uso: MOVEIS_THREADS=1 nice -n 10 blender-venv/bin/python -I efeitos_glb.py -- <saida> [ids...]
     (<saida> = SP/efeitos_out, onde efeitos_sprites.py já gravou as folhas e as faixas em _faixas/)

Convenções:
- Metros, Z para cima no Blender (Y no glTF). A raiz "efeito_<id>" fica no ponto de âncora do efeito (o mesmo de
  "emissao.ancora" no JSON: cabeça, boca da panela, tampo, chão...). Frente (o que tem frente: balões) para −Y do
  Blender, +Z do glTF.
- Movimento: um clipe glTF só, "laco", que fecha no início (o quadro final é igual ao primeiro). Qualquer motor toca com
  um AnimationMixer em repetição. O que aparece e some faz isso pela escala (zero = invisível), porque o glTF não anima a
  opacidade.
- Extras (nos eixos do glTF), só para o que o clipe não descreve, como na biblioteca da cidade:
    {"anima": "trocar", "quadros": n, "periodo": s}   a malha mostra um quadro da faixa e o offset.x pula a cada período
    {"anima": "piscar", "periodo": s, "suave": true}   a emissão tremula (chamas)
    {"billboard": true}                                 o nó vira para a câmera (balões, cintilar)
    {"decalque": true}                                  quad colado no chão ou no tampo, sem colisão
  A raiz leva {"efeito", "laco" (s), "ancora", "luz_propria"}.
- Materiais próprios (cores de CORES): "contorno" é o traço do cartum (casca invertida, só a face de trás aparece);
  os nomes terminados em "_luz" têm luz própria e não escurecem à noite; os demais, o motor escurece à noite.
"""
import json
import math
import os
import random
import struct
import sys

import bpy
import bmesh  # noqa: E402  (depois do bpy)
from mathutils import Euler, Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import icones_desenhos as D  # noqa: E402  (só usa as formas e as cores: não precisa do Blender)

C = D.C
FPS = 30
TINTA = D.TINTA


def lin(h):
    h = h.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


# ---------------------------------------------------------------------------------------------------------------------
# cena e materiais
# ---------------------------------------------------------------------------------------------------------------------
def limpa():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    scn = bpy.context.scene
    scn.render.fps = FPS
    scn.frame_start = 0
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"


def material(nome, cor, alpha=1.0, emis=0.0, rough=0.55, costas=False):
    m = bpy.data.materials.get(nome)
    if m:
        return m
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*lin(cor), 1)
    b.inputs["Roughness"].default_value = rough
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    if emis:
        b.inputs["Emission Color"].default_value = (*lin(cor), 1)
        b.inputs["Emission Strength"].default_value = emis
    m.use_backface_culling = costas
    return m


def mat_contorno():
    return material("contorno", TINTA, rough=1.0, costas=True)


def material_textura(nome, png, modo="BLEND", sem_luz=True):
    """Textura com transparência. modo BLEND (meio-transparente) ou MASK (recorte, decalques)."""
    m = bpy.data.materials.get(nome)
    if m:
        return m
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    img = bpy.data.images.load(png, check_existing=True)
    img.pack()
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = img
    if sem_luz:  # sem luz: Background + Transparent (o exportador grava KHR_materials_unlit)
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bg = nt.nodes.new("ShaderNodeBackground")
        trn = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = img
        nt.links.new(tx.outputs["Color"], bg.inputs["Color"])
        nt.links.new(tx.outputs["Alpha"], mix.inputs[0])
        nt.links.new(trn.outputs[0], mix.inputs[1])
        nt.links.new(bg.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
    else:
        b = nt.nodes["Principled BSDF"]
        nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.9
        if modo == "MASK":
            mt = nt.nodes.new("ShaderNodeMath")
            mt.operation = "GREATER_THAN"
            mt.inputs[1].default_value = 0.5
            nt.links.new(tx.outputs["Alpha"], mt.inputs[0])
            nt.links.new(mt.outputs[0], b.inputs["Alpha"])
        else:
            nt.links.new(tx.outputs["Alpha"], b.inputs["Alpha"])
    m.surface_render_method = "BLENDED"
    m["modo_alfa"] = modo
    return m


# ---------------------------------------------------------------------------------------------------------------------
# malhas
# ---------------------------------------------------------------------------------------------------------------------
def _liga(ob, pai=None):
    bpy.context.scene.collection.objects.link(ob)
    if pai is not None:
        ob.parent = pai
    return ob


def vazio(nome, pai=None, loc=(0, 0, 0), **extras):
    o = bpy.data.objects.new(nome, None)
    o.location = loc
    for k, v in extras.items():
        o[k] = v
    return _liga(o, pai)


def _de_bm(nome, bm, mat, pai=None, liso=True, angulo=35):
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    if liso:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(angulo))
    return _liga(bpy.data.objects.new(nome, me), pai)


def esfera(nome, r, mat, pai=None, loc=(0, 0, 0), esc=(1, 1, 1), seg=14, aneis=9):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=aneis, radius=r)
    for v in bm.verts:
        v.co = Vector((v.co.x * esc[0], v.co.y * esc[1], v.co.z * esc[2]))
    o = _de_bm(nome, bm, mat, pai, angulo=80)
    o.location = loc
    return o


def torno(nome, perfil, mat, pai=None, seg=16, loc=(0, 0, 0)):
    """Sólido de revolução em volta de Z; perfil = [(raio, z), ...] de baixo para cima (raio 0 nas pontas)."""
    bm = bmesh.new()
    aneis = []
    for r, z in perfil:
        if r < 1e-5:
            aneis.append([bm.verts.new((0, 0, z))])
        else:
            aneis.append([bm.verts.new((r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), z))
                          for k in range(seg)])
    for a, b in zip(aneis, aneis[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for k in range(seg):
                bm.faces.new((a[0], b[k], b[(k + 1) % seg]))
        elif len(b) == 1:
            for k in range(seg):
                bm.faces.new((a[k], b[0], a[(k + 1) % seg]))
        else:
            for k in range(seg):
                bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _de_bm(nome, bm, mat, pai, angulo=70)
    o.location = loc
    return o


def amostra(d, passos=8):
    """Pontos (x, y) do primeiro subcaminho de um SVG com comandos absolutos M L H V C Q Z."""
    import re
    toks = re.findall(r"[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?", d)
    pts, i, cmd, cur = [], 0, None, (0.0, 0.0)
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd == "Z":
                break
            continue
        if cmd in "ML":
            cur = (float(toks[i]), float(toks[i + 1]))
            pts.append(cur)
            i += 2
        elif cmd == "H":
            cur = (float(t), cur[1])
            pts.append(cur)
            i += 1
        elif cmd == "V":
            cur = (cur[0], float(t))
            pts.append(cur)
            i += 1
        elif cmd == "C":
            p1, p2, p3 = [(float(toks[i + 2 * j]), float(toks[i + 2 * j + 1])) for j in range(3)]
            for s in range(1, passos + 1):
                u = s / passos
                a, b, c, e = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3
                pts.append((a * cur[0] + b * p1[0] + c * p2[0] + e * p3[0], a * cur[1] + b * p1[1] + c * p2[1] + e * p3[1]))
            cur = p3
            i += 6
        elif cmd == "Q":
            p1, p2 = [(float(toks[i + 2 * j]), float(toks[i + 2 * j + 1])) for j in range(2)]
            for s in range(1, passos + 1):
                u = s / passos
                pts.append(((1 - u) ** 2 * cur[0] + 2 * u * (1 - u) * p1[0] + u * u * p2[0],
                            (1 - u) ** 2 * cur[1] + 2 * u * (1 - u) * p1[1] + u * u * p2[1]))
            cur = p2
            i += 4
        else:
            raise ValueError(cmd)
    limpo = []
    for p in pts:
        if not limpo or (abs(p[0] - limpo[-1][0]) + abs(p[1] - limpo[-1][1])) > 1e-4:
            limpo.append(p)
    if len(limpo) > 2 and abs(limpo[0][0] - limpo[-1][0]) + abs(limpo[0][1] - limpo[-1][1]) < 1e-4:
        limpo.pop()
    return limpo


def forma(d, escala, cx=0.0, cy=0.0, passos=8):
    """Caminho SVG normalizado → pontos (x, z) em metros (o y do SVG desce; o z sobe)."""
    return [((x - cx) * escala, -(y - cy) * escala) for x, y in amostra(d, passos)]


def extrusao(nome, pts, esp, mat, pai=None, bisel=0.0, loc=(0, 0, 0)):
    """Forma plana no plano XZ (frente para −Y), com espessura em Y e cantos da frente e de trás boleados."""
    area = sum(pts[k][0] * pts[(k + 1) % len(pts)][1] - pts[(k + 1) % len(pts)][0] * pts[k][1] for k in range(len(pts)))
    if area < 0:
        pts = pts[::-1]
    bm = bmesh.new()
    vs = [bm.verts.new((x, esp / 2, z)) for x, z in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    novos = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=novos, vec=(0, -esp, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bisel > 0:
        tampas = [fc for fc in bm.faces if len(fc.verts) > 4]
        arestas = list({e for fc in tampas for e in fc.edges})
        bmesh.ops.bevel(bm, geom=arestas, offset=bisel, segments=2, affect="EDGES", clamp_overlap=True, profile=0.5)
    bmesh.ops.triangulate(bm, faces=[fc for fc in bm.faces if len(fc.verts) > 4], quad_method="BEAUTY",
                          ngon_method="EAR_CLIP")
    o = _de_bm(nome, bm, mat, pai, angulo=40)
    o.location = loc
    return o


def contorno(ob, e=0.006, mat=None):
    """Traço do cartum: casca um pouco maior com as faces invertidas e material que só mostra o lado de trás."""
    me = ob.data.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    nrm = {v.index: v.normal.copy() for v in bm.verts}
    for v in bm.verts:
        v.co += nrm[v.index] * e
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(mat or mat_contorno())
    o = bpy.data.objects.new(ob.name + "_contorno", me)
    return _liga(o, ob)


def quad(nome, w, h, mat, pai=None, uv=(0, 0, 1, 1), plano="xz", loc=(0, 0, 0)):
    """Retângulo com UV num trecho da textura. plano xz: em pé, frente −Y; plano xy: deitado (decalque)."""
    bm = bmesh.new()
    if plano == "xz":
        cs = [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)]
    else:
        cs = [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)]
    vs = [bm.verts.new(c) for c in cs]
    f = bm.faces.new(vs)
    if plano == "xz":
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    lay = bm.loops.layers.uv.new("UVMap")
    u0, v0, u1, v1 = uv
    for lp in f.loops:
        x = lp.vert.co.x
        yy = lp.vert.co.z if plano == "xz" else lp.vert.co.y
        lp[lay].uv = (u0 if x < 0 else u1, v0 if yy < 0 else v1)
    o = _de_bm(nome, bm, mat, pai, liso=False)
    o.location = loc
    return o


# ---------------------------------------------------------------------------------------------------------------------
# animação
# ---------------------------------------------------------------------------------------------------------------------
def suave(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def tr(t, a, b):
    return suave((t - a) / max(1e-6, b - a))


def anima(ob, P, f):
    """Grava um clipe que fecha em P segundos: f(t) devolve dict com loc, rot (graus) e esc (número ou trio)."""
    n = max(1, round(P * FPS))
    base_loc = Vector(ob.location)
    base_rot = Euler(ob.rotation_euler)
    for fr in range(n + 1):
        t = (fr % n) / FPS
        d = f(t)
        if "loc" in d:
            ob.location = base_loc + Vector(d["loc"])
            ob.keyframe_insert("location", frame=fr)
        if "rot" in d:
            ob.rotation_euler = Euler([base_rot[i] + math.radians(d["rot"][i]) for i in range(3)])
            ob.keyframe_insert("rotation_euler", frame=fr)
        if "esc" in d:
            e = d["esc"]
            e = (e, e, e) if isinstance(e, (int, float)) else e
            # nunca zero: com escala zero o exportador não inverte a matriz do pai e os filhos saem degenerados
            ob.scale = tuple(max(abs(v), 1e-3) * (1 if v >= 0 else -1) for v in e)
            ob.keyframe_insert("scale", frame=fr)
    bpy.context.scene.frame_end = max(bpy.context.scene.frame_end if bpy.context.scene.frame_end > 1 else 0, n)


def fecha_nla():
    for o in bpy.data.objects:
        ad = o.animation_data
        if ad and ad.action:
            t = ad.nla_tracks.new()
            t.name = "laco"
            t.strips.new("laco", 0, ad.action)
            ad.action = None


def ciclo(t, P, fase):
    """Idade de 0 a 1 de uma partícula do laço, com a fase (0 a 1) dela."""
    return ((t / P) + fase) % 1.0


def pop(u, a=0.12, b=0.85, pico=1.15):
    """Escala de quem aparece com um pulinho, fica e some: 0 → pico → 1 ... 1 → 0."""
    if u < a:
        v = u / a
        return pico * math.sin(v * math.pi / 2) if v < 0.8 else pico + (1 - pico) * (v - 0.8) / 0.2
    if u > b:
        return max(0.0, 1 - suave((u - b) / (1 - b)))
    return 1.0


# ---------------------------------------------------------------------------------------------------------------------
# exportação
# ---------------------------------------------------------------------------------------------------------------------
def _glb_le(caminho):
    b = open(caminho, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    js = json.loads(b[20:20 + n])
    resto = b[20 + n:]
    return js, resto


def _glb_grava(caminho, js, resto):
    txt = json.dumps(js, separators=(",", ":")).encode()
    txt += b" " * ((4 - len(txt) % 4) % 4)
    corpo = struct.pack("<I", len(txt)) + b"JSON" + txt + resto
    open(caminho, "wb").write(b"glTF" + struct.pack("<II", 2, 12 + len(corpo)) + corpo)


def exporta(raiz, caminho):
    fecha_nla()
    for o in bpy.context.scene.objects:
        o.select_set(True)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=caminho, export_format="GLB", use_selection=False, export_extras=True,
                              export_yup=True, export_apply=True, export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_cameras=False,
                              export_lights=False, export_image_format="AUTO", export_attributes=False)
    js, resto = _glb_le(caminho)
    # transparência: os materiais com alfa constante ou textura de alfa vão como BLEND; decalques como MASK
    for m in js.get("materials", []):
        bm = bpy.data.materials.get(m["name"])
        if not bm:
            continue
        modo = bm.get("modo_alfa")
        if modo == "MASK":
            m["alphaMode"] = "MASK"
            m["alphaCutoff"] = 0.5
        elif modo == "BLEND" or (bm.use_nodes and "Principled BSDF" in bm.node_tree.nodes and
                                 bm.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value < 1):
            m["alphaMode"] = "BLEND"
            m.pop("alphaCutoff", None)
    _glb_grava(caminho, js, resto)
    tris = 0
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    nomes_anim = [a["name"] for a in js.get("animations", [])]
    extras = sorted({json.dumps(n["extras"], ensure_ascii=False) for n in js["nodes"] if n.get("extras")})
    return {"tris": tris, "animacoes": nomes_anim, "bytes": os.path.getsize(caminho), "extras": [json.loads(e) for e in extras]}


# ---------------------------------------------------------------------------------------------------------------------
# os efeitos
# ---------------------------------------------------------------------------------------------------------------------
def raiz(id_, P, ancora, luz=False, **extra):
    return vazio(f"efeito_{id_}", efeito=id_, laco=P, ancora=ancora, luz_propria=luz, **extra)


def e_espuma(R):
    P = 3.0
    r0 = raiz("espuma", P, "superficie")
    branco = material("espuma", C["branco"], rough=0.45)
    azul = material("espuma_sombra", C["porcelana_azul"], rough=0.45)
    rnd = random.Random(3)
    for k in range(11):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(0, 0.24)
        r = rnd.uniform(0.045, 0.09)
        o = esfera(f"espuma_{k}", r, branco if k % 3 else azul, r0, loc=(d * math.cos(a), d * math.sin(a), r * 0.35),
                   esc=(1, 1, 0.72))
        fase = rnd.random()
        anima(o, P, lambda t, f=fase: {"esc": (1 + 0.07 * math.sin(2 * math.pi * (t / P * 2 + f)),
                                                1 + 0.07 * math.sin(2 * math.pi * (t / P * 2 + f + 0.25)),
                                                1 + 0.1 * math.sin(2 * math.pi * (t / P * 3 + f)))})
    bolha = material("bolha", C["azul_bebe"], alpha=0.45, rough=0.1)
    for k in range(5):
        a = rnd.uniform(0, 2 * math.pi)
        o = esfera(f"bolhinha_{k}", 0.022, bolha, r0, loc=(0.18 * math.cos(a), 0.18 * math.sin(a), 0.06), seg=10, aneis=7)
        fase = k / 5
        anima(o, P, lambda t, f=fase: (lambda u: {"loc": (0, 0, 0.35 * u), "esc": pop(u, 0.1, 0.88)})(ciclo(t, P, f)))


def e_bolhas(R):
    P = 3.0
    r0 = raiz("bolhas", P, "superficie")
    bolha = material("bolha", C["azul_bebe"], alpha=0.4, rough=0.08)
    luz = material("bolha_brilho", C["branco"], emis=0.4)
    rnd = random.Random(5)
    for k in range(8):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(0.02, 0.22)
        r = rnd.uniform(0.03, 0.055)
        g = vazio(f"bolha_{k}", r0, loc=(d * math.cos(a), d * math.sin(a), 0.03))
        esfera(f"bolha_{k}_casca", r, bolha, g, seg=16, aneis=10)
        esfera(f"bolha_{k}_brilho", r * 0.22, luz, g, loc=(-r * 0.45, -r * 0.6, r * 0.5), esc=(1, 0.6, 0.7), seg=8, aneis=5)
        fase = k / 8
        sw = rnd.uniform(0.02, 0.04)

        def f(t, fase=fase, sw=sw):
            u = ciclo(t, P, fase)
            e = 0.0 if u < 0.02 else (min(1, (u - 0.02) / 0.12) if u < 0.9 else (1.25 if u < 0.94 else 0.0))
            return {"loc": (sw * math.sin(2 * math.pi * u * 2), 0, 0.7 * u), "esc": e}
        anima(g, P, f)


def puffs(id_, P, n, cor, alpha, sobe, r_max, abre, seed, ancora="boca", traco=None, e_traco=0.04):
    """Nuvenzinhas opacas de cartum com contorno fino (traco): leem sobre parede branca e céu claro."""
    r0 = raiz(id_, P, ancora)
    m = material(id_, cor, alpha=alpha, rough=0.9)
    mt = material(f"{id_}_contorno", traco, rough=1.0, costas=True) if traco else None
    rnd = random.Random(seed)
    for k in range(n):
        g = vazio(f"{id_}_{k}", r0)
        for j in range(3):  # cada nuvenzinha são três bolas juntas
            a = j * 2.1 + rnd.random()
            b = esfera(f"{id_}_{k}_{j}", rnd.uniform(0.7, 1.0), m, g, loc=(0.5 * math.cos(a), 0.5 * math.sin(a) * 0.6,
                                                                              0.25 * (j - 1)), seg=10, aneis=7)
            if mt:
                contorno(b, e_traco, mt)
        fase = k / n
        dx, dy = rnd.uniform(-1, 1) * abre, rnd.uniform(-1, 1) * abre
        gira = rnd.uniform(-60, 60)

        def f(t, fase=fase, dx=dx, dy=dy, gira=gira):
            u = ciclo(t, P, fase)
            e = r_max * (0.25 + 0.75 * tr(u, 0, 0.55)) * (1 - tr(u, 0.7, 1.0)) * (0 if u < 0.01 else 1)
            return {"loc": (dx * u + 0.03 * math.sin(u * 6), dy * u, sobe * u), "rot": (0, 0, gira * u), "esc": max(e, 0.0)}
        anima(g, P, f)


def e_vapor(R):
    puffs("vapor", 2.4, 7, C["branco"], 1.0, 0.5, 0.09, 0.06, 7, traco=C["cinza_azulado"], e_traco=0.045)


def e_fumaca(R):
    puffs("fumaca", 3.2, 8, C["cinza_medio"], 1.0, 0.95, 0.18, 0.12, 9, traco=C["grafite"], e_traco=0.03)


def gota_perfil(r, h):
    """Gota em pé: ponta para cima (z de 0 a h)."""
    pts = []
    for k in range(9):
        a = math.pi * k / 8
        pts.append((r * math.sin(a), r - r * math.cos(a)))
    pts = [(x, z) for x, z in pts]
    perfil = [(0, 0)] + [(x, z) for x, z in pts[1:5]]
    for k in range(1, 6):
        u = k / 6
        perfil.append((r * (1 - u) ** 1.4, r + (h - r) * u))
    perfil.append((0, h))
    return perfil


def e_respingos(R):
    P = 1.0
    r0 = raiz("respingos", P, "superficie")
    agua = material("agua", C["agua"], alpha=0.88, rough=0.08)
    rnd = random.Random(11)
    for k in range(9):
        a = 2 * math.pi * k / 9 + rnd.uniform(-0.2, 0.2)
        vh, vv = rnd.uniform(0.35, 0.6), rnd.uniform(1.0, 1.4)
        g = vazio(f"pingo_{k}", r0)
        torno(f"pingo_{k}_malha", gota_perfil(0.014, 0.04), agua, g, seg=10)

        def f(t, a=a, vh=vh, vv=vv):
            z = vv * t - 4.9 * t * t
            if z < 0 or t > 0.32:
                return {"loc": (0, 0, 0), "esc": 0.0, "rot": (0, 0, 0)}
            vz = vv - 9.8 * t
            incl = math.degrees(math.atan2(vh, vz))
            return {"loc": (vh * t * math.cos(a), vh * t * math.sin(a), z), "rot": (0, incl, math.degrees(a)), "esc": 1.0}
        anima(g, P, f)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.012, major_segments=20, minor_segments=8)
    coroa = bpy.context.object
    coroa.name = "coroa"
    coroa.data.materials.append(agua)
    coroa.data.shade_smooth()
    coroa.parent = r0
    anima(coroa, P, lambda t: {"esc": (lambda s: (0.6 + 1.2 * tr(t, 0, 0.35), 0.6 + 1.2 * tr(t, 0, 0.35), 1.6 * s))(
        tr(t, 0, 0.08) * (1 - tr(t, 0.3, 0.45)))})


def e_gotas(R):
    P = 1.2
    queda = 1.6
    tq = math.sqrt(2 * queda / 9.8)
    r0 = raiz("gotas", P, "bico", queda=queda)
    agua = material("agua", C["agua"], alpha=0.88, rough=0.08)
    rnd = random.Random(13)
    for k in range(6):
        a, d = rnd.uniform(0, 2 * math.pi), rnd.uniform(0, 0.08)
        x, y = d * math.cos(a), d * math.sin(a)
        g = vazio(f"gota_{k}", r0, loc=(x, y, 0))
        o = torno(f"gota_{k}_malha", gota_perfil(0.02, 0.075), agua, g, seg=10)
        o.location = (0, 0, -0.035)
        fase = k / 6

        def f(t, fase=fase):
            s = (ciclo(t, P, fase)) * P
            if s > tq:
                return {"loc": (0, 0, -queda), "esc": 0.0}
            return {"loc": (0, 0, -4.9 * s * s), "esc": (1, 1, 1 + 0.8 * s / tq)}
        anima(g, P, f)
        anel = esfera(f"pingo_anel_{k}", 0.03, agua, r0, loc=(x, y, -queda + 0.004), esc=(1, 1, 0.12), seg=12, aneis=6)

        def fa(t, fase=fase):
            s = ciclo(t, P, fase) * P - tq
            return {"esc": (0.0 if s < 0 or s > 0.25 else (0.4 + 2.2 * s / 0.25) * (1 - s / 0.25 * 0.5))}
        anima(anel, P, fa)


def e_fogo(R):
    P = 1.0
    r0 = raiz("fogo", P, "tampo", luz=True)
    chamas = vazio("chamas", r0, anima="piscar", periodo=0.45, suave=True)
    cores = [("chama_laranja_luz", C["laranja"], 0.85), ("chama_amarela_luz", C["amarelo"], 0.95),
             ("chama_miolo_luz", C["creme_claro"], 1.0)]
    mats = [material(n, c, emis=e, rough=0.8) for n, c, e in cores]
    rnd = random.Random(17)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.4
        d = 0.0 if k == 0 else 0.085
        h = 0.32 if k == 0 else rnd.uniform(0.18, 0.24)
        g = vazio(f"lingua_{k}", chamas, loc=(d * math.cos(a), d * math.sin(a), 0))
        for j, m in enumerate(mats):
            s = [1.0, 0.68, 0.4][j]
            o = torno(f"lingua_{k}_{j}", gota_perfil(0.058 * s, h * s), m, g, seg=12)
            o.location = (0, -0.004 * j, 0.004 * j)
            if j == 0:
                contorno(o, 0.005)
        f1, f2, ph = rnd.choice([3, 4, 5]), rnd.choice([2, 3]), rnd.random()

        def f(t, f1=f1, f2=f2, ph=ph):
            w = 2 * math.pi * t / P
            return {"esc": (1 + 0.08 * math.sin(f2 * w + ph * 6), 1 + 0.08 * math.cos(f2 * w + ph * 6),
                            1 + 0.18 * math.sin(f1 * w + ph * 6)),
                    "rot": (6 * math.sin(f2 * w + ph), 6 * math.cos(f1 * w + ph), 0)}
        anima(g, P, f)
    brasa = material("brasa_luz", C["brasa"], emis=1.0)
    for k in range(4):
        o = esfera(f"faisca_{k}", 0.012, brasa, r0, seg=6, aneis=4)
        fase, a = k / 4, rnd.uniform(0, 6.28)
        anima(o, P, lambda t, fase=fase, a=a: (lambda u: {"loc": (0.05 * math.cos(a) + 0.02 * math.sin(u * 9), 0.05 * math.sin(a),
                                                                  0.1 + 0.4 * u), "esc": 1 - u})(ciclo(t, P, fase)))


def e_decalques(id_, P, png, celulas, tam, ancora):
    r0 = raiz(id_, P, ancora)
    m = material_textura(f"{id_}_decalque", png, modo="MASK", sem_luz=False)
    rnd = random.Random(19)
    for k, (cel, (x, y), s) in enumerate(celulas):
        c, l = cel % 4, cel // 4
        uv = (c / 4, 1 - (l + 1) / 2, (c + 1) / 4, 1 - l / 2)
        o = quad(f"{id_}_{k}", tam * s, tam * s, m, r0, uv=uv, plano="xy", loc=(x, y, 0.003 + 0.001 * k))
        o["decalque"] = True
        o.rotation_euler = (0, 0, rnd.uniform(0, 6.28))
        atraso = k * 0.4
        anima(o, P, lambda t, a=atraso: {"esc": tr(t, a, a + 1.5) * (1 - tr(t, P - 1.8 + a * 0.3, P - 0.8 + a * 0.3))})


def e_sujeira_chao(R):
    e_decalques("sujeira_chao", 6.0, os.path.join(R, "sujeira_chao", "sujeira_chao_folha.png"),
                [(0, (0, 0), 1.0), (1, (0.45, 0.25), 0.7), (6, (-0.4, 0.3), 0.6)], 0.6, "chao")


def e_sujeira_louca(R):
    e_decalques("sujeira_louca", 6.0, os.path.join(R, "sujeira_louca", "sujeira_louca_folha.png"),
                [(0, (0, 0), 1.0), (1, (0.02, -0.01), 0.8)], 0.16, "tampo")


def e_moscas(R):
    P = 2.0
    r0 = raiz("moscas", P, "topo")
    corpo = material("mosca_corpo", C["grafite"], rough=0.5)
    olho = material("mosca_olho", C["vermelho"], rough=0.4)
    asa = material("mosca_asa", C["porcelana_azul"], alpha=0.6, rough=0.2)
    for k in range(3):
        orb = vazio(f"orbita_{k}", r0, loc=(0, 0, 0.26 + 0.08 * k))
        sentido = 1 if k != 1 else -1
        voltas = [2, 3, 2][k]
        anima(orb, P, lambda t, s=sentido, v=voltas: {"rot": (0, 0, s * 360 * v * t / P)})
        raio = [0.16, 0.24, 0.2][k]
        m = vazio(f"mosca_{k}", orb, loc=(raio, 0, 0))
        m.rotation_euler = (0, 0, math.radians(0 if sentido > 0 else 180))
        esfera(f"mosca_{k}_corpo", 0.034, corpo, m, esc=(0.8, 1.25, 0.8), seg=10, aneis=6)
        esfera(f"mosca_{k}_cabeca", 0.024, corpo, m, loc=(0, 0.043, 0.006), seg=8, aneis=6)
        for lado in (-1, 1):
            esfera(f"mosca_{k}_olho{lado}", 0.012, olho, m, loc=(0.015 * lado, 0.055, 0.013), seg=6, aneis=4)
            piv = vazio(f"mosca_{k}_asa{lado}", m, loc=(0.012 * lado, 0.0, 0.026))
            esfera(f"mosca_{k}_asa{lado}_m", 0.036, asa, piv, loc=(0.03 * lado, -0.016, 0), esc=(1, 0.55, 0.12), seg=8, aneis=4)
            anima(piv, P, lambda t, l=lado: {"rot": (0, l * 35 * math.sin(2 * math.pi * 15 * t / P * 2), 0)})
        anima(m, P, lambda t, k=k: {"loc": (0, 0, 0.03 * math.sin(2 * math.pi * (3 + k) * t / P))})


def e_cheiro_ruim(R):
    P = 2.4
    r0 = raiz("cheiro_ruim", P, "topo")
    m = material("cheiro", C["verde_lima"], rough=0.6, emis=0.15)
    for k in range(3):
        g = vazio(f"onda_{k}", r0, loc=((k - 1) * 0.1, 0, 0.05))
        cv = bpy.data.curves.new(f"onda_{k}_c", "CURVE")
        cv.dimensions = "3D"
        cv.bevel_depth = 0.012
        cv.bevel_resolution = 2
        sp = cv.splines.new("POLY")
        n = 16
        sp.points.add(n - 1)
        for j in range(n):
            u = j / (n - 1)
            sp.points[j].co = (0.035 * math.sin(u * 2 * math.pi * 1.5 + k), 0, 0.26 * u, 1)
        co = bpy.data.objects.new(f"onda_{k}_curva", cv)
        _liga(co, g)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(co.evaluated_get(dg))
        bpy.data.objects.remove(co)
        me.materials.clear()
        me.materials.append(m)
        me.shade_smooth()
        o = _liga(bpy.data.objects.new(f"onda_{k}_malha", me), g)
        contorno(o, 0.005)
        fase = k / 3
        anima(g, P, lambda t, f=fase: (lambda u: {"loc": (0, 0, 0.3 * u), "rot": (0, 12 * math.sin(u * 2 * math.pi * 2), 0),
                                                  "esc": (1, 1, max(0.0, pop(u, 0.25, 0.75, 1.05)))})(ciclo(t, P, f)))


def e_brilho(R):
    P = 1.6
    r0 = raiz("brilho", P, "volume", luz=True, volume=[0.9, 1.6, 0.2])
    m = material("brilho_luz", C["amarelo_claro"], emis=1.0, rough=0.5)
    miolo = material("brilho_miolo_luz", C["branco"], emis=1.0)
    pts = forma(D.ESTRELA4, 0.11, passos=4)
    rnd = random.Random(23)
    for k in range(9):
        g = vazio(f"estrela_{k}", r0, loc=(rnd.uniform(-0.45, 0.45), rnd.uniform(-0.1, 0.05), 0.12 + 1.4 * k / 8 + rnd.uniform(-0.08, 0.08)), billboard=True)
        o = extrusao(f"estrela_{k}_m", pts, 0.012, m, g, bisel=0.002)
        extrusao(f"estrela_{k}_miolo", forma(D.ESTRELA4, 0.05, passos=3), 0.016, miolo, g)
        contorno(o, 0.004)
        fase = (k * 4 % 9) / 9
        anima(g, P, lambda t, f=fase: (lambda u: {"esc": math.sin(math.pi * min(1, u / 0.5)) if u < 0.5 else 0.0,
                                                  "rot": (0, 180 * u, 0)})(ciclo(t, P, f)))
    # um cintilar de folha (faixa de 8 quadros) virado para a câmera: a convenção "trocar"
    mf = material_textura("brilho_faixa", os.path.join(R, "_faixas", "brilho.png"), modo="BLEND", sem_luz=True)
    q = quad("cintilar", 0.4, 0.4, mf, r0, uv=(0, 0, 1 / 8, 1), loc=(0.15, -0.08, 0.9))
    q["anima"] = "trocar"
    q["quadros"] = 8
    q["periodo"] = 0.1
    q["billboard"] = True


def sobe_e_some(g, P, fase, sobe, deriva=(0, 0), balanca=0.04, gira=12, pico=1.15):
    def f(t):
        u = ciclo(t, P, fase)
        return {"loc": (deriva[0] * u + balanca * math.sin(2 * math.pi * u * 1.5), deriva[1] * u, sobe * u),
                "esc": pop(u, 0.14, 0.82, pico), "rot": (0, gira * math.sin(2 * math.pi * u), 0)}
    anima(g, P, f)


def e_coracoes(R):
    P = 2.1
    r0 = raiz("coracoes", P, "cabeca", luz=True)
    cores = [material("coracao_rosa", C["rosa"], emis=0.35, rough=0.4), material("coracao_vermelho", C["vermelho"], emis=0.35,
                                                                                  rough=0.4)]
    pts = forma(D.CORACAO, 0.06)
    for k in range(3):
        g = vazio(f"coracao_{k}", r0, loc=((k - 1) * 0.09, 0, 0))
        o = extrusao(f"coracao_{k}_m", pts, 0.035, cores[k % 2], g, bisel=0.008)
        contorno(o, 0.005)
        sobe_e_some(g, P, k / 3, 0.42)


def nota(nome, pai, mat, tipo):
    g = vazio(nome, pai)
    pecas = []
    cab = [(0.028 * math.cos(2 * math.pi * k / 16), 0.02 * math.sin(2 * math.pi * k / 16)) for k in range(16)]
    cab = [(x * math.cos(0.35) - z * math.sin(0.35), x * math.sin(0.35) + z * math.cos(0.35)) for x, z in cab]
    if tipo == 2:
        for dx in (-0.045, 0.045):
            pecas.append(extrusao(f"{nome}_cab{dx}", [(x + dx, z + (0.012 if dx > 0 else 0)) for x, z in cab], 0.022, mat, g, bisel=0.004))
            pecas.append(extrusao(f"{nome}_haste{dx}", [(dx + 0.02, 0.005), (dx + 0.032, 0.005), (dx + 0.032, 0.13), (dx + 0.02, 0.13)],
                                  0.016, mat, g))
        pecas.append(extrusao(f"{nome}_barra", [(-0.025, 0.11), (0.077, 0.13), (0.077, 0.155), (-0.025, 0.135)], 0.016, mat, g))
    else:
        pecas.append(extrusao(f"{nome}_cab", cab, 0.022, mat, g, bisel=0.004))
        pecas.append(extrusao(f"{nome}_haste", [(0.018, 0.005), (0.03, 0.005), (0.03, 0.14), (0.018, 0.14)], 0.016, mat, g))
        if tipo == 1:
            pecas.append(extrusao(f"{nome}_bandeira", forma("M74 22 C90 30 100 42 92 62 C92 48 86 42 74 40 Z", 0.0026, 74, 22),
                                  0.016, mat, g, loc=(0.024, 0, 0.14)))
    for p in pecas:
        contorno(p, 0.004)
    return g


def e_notas(R):
    P = 2.4
    r0 = raiz("notas", P, "cabeca", luz=True)
    cores = [C["roxo"], C["azul"], C["rosa_escuro"]]
    for k in range(3):
        m = material(f"nota_{k}", cores[k], emis=0.35, rough=0.4)
        g = vazio(f"nota_{k}_sobe", r0, loc=((k - 1) * 0.1, 0, 0))
        nota(f"nota_{k}", g, m, k)
        sobe_e_some(g, P, k / 3, 0.42, balanca=0.06, gira=25)


def e_zzz(R):
    P = 2.7
    r0 = raiz("zzz", P, "cabeca", luz=True)
    m = material("zzz_branco", C["branco"], emis=0.3, rough=0.5)
    z = [(-1, -1), (1, -1), (1, -0.6), (-0.38, 0.6), (1, 0.6), (1, 1), (-1, 1), (-1, 0.6), (0.38, -0.6), (-1, -0.6)]
    pts = [(x * 0.05, -y * 0.05) for x, y in z]
    for k in range(3):
        g = vazio(f"z_{k}", r0)
        o = extrusao(f"z_{k}_m", pts, 0.025, m, g, bisel=0.005)
        contorno(o, 0.006)
        fase = k / 3

        def f(t, fase=fase):
            u = ciclo(t, P, fase)
            e = (0.4 + 1.1 * u) * pop(u, 0.1, 0.86, 1.0)
            return {"loc": (0.2 * u + 0.025 * math.sin(u * 2 * math.pi * 1.5), 0, 0.4 * u), "esc": e,
                    "rot": (0, -12 + 8 * math.sin(u * 6.28), 0)}
        anima(g, P, f)


def e_suor(R):
    P = 1.4
    r0 = raiz("suor", P, "cabeca")
    m = material("suor", C["azul_bebe"], alpha=0.92, rough=0.15, emis=0.15)
    for k, lado in enumerate((-1, 1)):
        g = vazio(f"suor_{k}", r0, loc=(0.13 * lado, -0.02, 0.06))
        o = torno(f"suor_{k}_m", gota_perfil(0.024, 0.075), m, g, seg=12)
        contorno(o, 0.004)
        fase = k * 0.5

        def f(t, fase=fase, lado=lado):
            u = ciclo(t, P, fase)
            cai = tr(u, 0.35, 1.0)
            return {"loc": (0.03 * lado * cai, 0, -0.22 * cai * cai), "esc": pop(u, 0.25, 0.85, 1.1),
                    "rot": (0, -15 * lado * cai, 0)}
        anima(g, P, f)


def e_raiva(R):
    P = 1.6
    r0 = raiz("raiva", P, "cabeca")
    nuvem = vazio("nuvem", r0)
    m = material("nuvem_raiva", C["cinza_azulado"], rough=0.7, emis=0.12)
    olho = material("raiva_olho_luz", C["vermelho_claro"], emis=1.5)
    bolas = [(-0.09, 0, 0.0, 0.08), (0.0, 0, 0.04, 0.1), (0.09, 0, 0.0, 0.08), (0.0, 0.0, -0.03, 0.08), (-0.15, 0, -0.04, 0.05),
             (0.15, 0, -0.04, 0.05)]
    for k, (x, y, z, r) in enumerate(bolas):
        o = esfera(f"nuvem_{k}", r, m, nuvem, loc=(x, y, z), esc=(1, 0.75, 0.9))
        contorno(o, 0.007)
    for lado in (-1, 1):
        o = extrusao(f"sobrancelha{lado}", [(0, 0), (0.05, -0.016), (0.05, -0.006), (0, 0.01)], 0.01, olho, nuvem,
                     loc=(-0.05 if lado < 0 else 0.05, -0.08, 0.02))
        if lado > 0:
            o.scale.x = -1
    anima(nuvem, P, lambda t: {"esc": (1 + 0.04 * math.sin(2 * math.pi * 4 * t / P), 1, 1 + 0.05 * math.sin(2 * math.pi * 4 * t / P + 1)),
                               "rot": (0, 4 * math.sin(2 * math.pi * 2 * t / P), 0)})
    mr = material("raio_luz", C["amarelo"], emis=2.0)
    raio = forma("M72 18 L36 70 H59 L50 110 L92 52 H68 L82 18 Z", 0.0026, 64, 18)
    g = vazio("raio", r0, loc=(0.02, -0.02, -0.07))
    o = extrusao("raio_m", raio, 0.018, mr, g, bisel=0.003)
    contorno(o, 0.005)
    anima(g, P, lambda t: {"esc": 1.0 if (0.2 < t < 0.35 or 0.45 < t < 0.55 or 1.0 < t < 1.15) else 0.0})


def serpentina_malha(nome, mat, pai, comp=0.16, raio=0.02, voltas=2.5):
    cv = bpy.data.curves.new(nome + "_c", "CURVE")
    cv.dimensions = "3D"
    cv.bevel_depth = 0.0045
    cv.bevel_resolution = 1
    sp = cv.splines.new("POLY")
    n = 28
    sp.points.add(n - 1)
    for j in range(n):
        t = j / (n - 1)
        a = 2 * math.pi * voltas * t
        sp.points[j].co = (raio * math.cos(a), raio * math.sin(a), comp * (t - 0.5), 1)
    co = _liga(bpy.data.objects.new(nome + "_curva", cv), pai)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(co.evaluated_get(dg))
    bpy.data.objects.remove(co)
    me.materials.clear()
    me.materials.append(mat)
    me.shade_smooth()
    return _liga(bpy.data.objects.new(nome, me), pai)


def e_confete(R):
    P = 3.0
    r0 = raiz("confete", P, "chao", luz=True)
    rnd = random.Random(29)
    cores = [C["rosa"], C["amarelo"], C["azul_celeste"], C["verde_claro"], C["laranja"], C["roxo"]]
    mats = [material(f"confete_{k}", c, emis=0.25, rough=0.6) for k, c in enumerate(cores)]
    for k in range(54):
        tipo = ("papel", "papel", "circulo", "serpentina")[k % 4] if k < 52 else "serpentina"
        m = mats[k % len(mats)]
        if tipo == "serpentina":
            o = serpentina_malha(f"confete_{k}", m, r0)
        else:
            bm = bmesh.new()
            if tipo == "papel":
                bmesh.ops.create_cube(bm, size=1)
                for v in bm.verts:
                    v.co = Vector((v.co.x * 0.05, v.co.y * 0.03, v.co.z * 0.003))
            else:
                bmesh.ops.create_circle(bm, cap_ends=True, segments=12, radius=0.02)
                r = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
                bmesh.ops.translate(bm, verts=[g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, 0.003))
                bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            o = _de_bm(f"confete_{k}", bm, m, r0, liso=False)
        a = rnd.uniform(0, 2 * math.pi)
        ab = math.radians(rnd.uniform(5, 38))
        v0 = rnd.uniform(2.4, 3.4)
        vx, vy, vz = v0 * math.sin(ab) * math.cos(a), v0 * math.sin(ab) * math.sin(a), v0 * math.cos(ab)
        wr = [rnd.uniform(-540, 540) for _ in range(3)]
        atraso = rnd.uniform(0, 0.12)
        k_ar, g = (2.2 if tipo == "serpentina" else 1.4), 3.2

        def f(t, vx=vx, vy=vy, vz=vz, wr=wr, atraso=atraso, k_ar=k_ar):
            s_ = t - atraso
            if s_ <= 0:
                return {"loc": (0, 0, 1.0), "esc": 0.0, "rot": (0, 0, 0)}
            e = math.exp(-k_ar * s_)
            fx = (1 - e) / k_ar
            z = 1.0 + vz * fx - g / k_ar * (s_ - fx)
            some = 1 - tr(s_, 2.4, 2.85)
            return {"loc": (vx * fx + 0.05 * math.sin(s_ * 7), vy * fx, max(z, 0.002)), "esc": some,
                    "rot": (wr[0] * s_, wr[1] * s_, wr[2] * s_)}
        anima(o, P, f)


def balao(id_, R, tipo):
    P = 3.0
    r0 = raiz(id_, P, "cabeca", luz=True, billboard=True)
    corpo = vazio(f"{id_}_corpo", r0, loc=(0.2, 0, 0.42))  # acima e ao lado da cabeça, como nas partículas
    branco = material("balao_branco", C["branco"], emis=0.25, rough=0.5)
    pecas = []
    if tipo == "pensamento":
        for k, (x, z, r) in enumerate([(0, 0.02, 0.14), (-0.13, 0, 0.1), (0.13, 0, 0.1), (-0.06, 0.1, 0.1), (0.07, 0.1, 0.1),
                                       (0, -0.07, 0.11)]):
            pecas.append(esfera(f"nuvem_{k}", r, branco, corpo, loc=(x, 0.03, z), esc=(1, 0.3, 0.9)))
        for k, (x, z, r) in enumerate([(-0.15, -0.17, 0.035), (-0.21, -0.24, 0.02)]):
            pecas.append(esfera(f"rastro_{k}", r, branco, corpo, loc=(x, 0.03, z), esc=(1, 0.5, 1)))
    else:
        w, h, r = 0.38, 0.27, 0.11
        pts = []
        for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180),
                           (w / 2 - r, -h / 2 + r, 270)):
            for j in range(7):
                a = math.radians(a0 + 90 * j / 6)
                pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
        pecas.append(extrusao("balao_corpo", pts, 0.05, branco, corpo, bisel=0.012, loc=(0, 0.03, 0.02)))
        pecas.append(extrusao("balao_rabo", [(-0.12, -0.08), (-0.02, -0.08), (-0.16, -0.2)], 0.04, branco, corpo,
                              bisel=0.006, loc=(0, 0.03, 0.0)))
    for p in pecas:
        contorno(p, 0.008)
    m = material_textura("balao_icones", os.path.join(R, "_faixas", "icones_balao.png"), modo="BLEND", sem_luz=True)
    q = quad("icone", 0.2, 0.2, m, corpo, uv=(0, 0, 1 / 8, 1), loc=(0, -0.012, 0.03 if tipo == "pensamento" else 0.025))
    q["anima"] = "trocar"
    q["quadros"] = 8
    q["periodo"] = P
    q["icones"] = ["fome", "energia", "social", "diversao", "dinheiro", "cozinhar", "dormir", "apaixonado"]

    def f(t):
        if t < 0.24:
            e = 1.12 * suave(t / 0.24)
        elif t < 0.4:
            e = 1.12 - 0.12 * suave((t - 0.24) / 0.16)
        elif t < 2.64:
            e = 1.0 + 0.015 * math.sin(2 * math.pi * (t - 0.4) / 0.75)
        elif t < 2.8:
            e = 1.0 + 0.1 * suave((t - 2.64) / 0.16)
        else:
            e = 1.1 * (1 - suave((t - 2.8) / 0.18))
        return {"esc": max(e, 0.0)}
    anima(corpo, P, f)


def e_balao_pensamento(R):
    balao("balao_pensamento", R, "pensamento")


def e_balao_fala(R):
    balao("balao_fala", R, "fala")


EFEITOS = {
    "espuma": e_espuma, "bolhas": e_bolhas, "vapor": e_vapor, "respingos": e_respingos, "gotas": e_gotas, "fumaca": e_fumaca,
    "fogo": e_fogo, "sujeira_chao": e_sujeira_chao, "sujeira_louca": e_sujeira_louca, "moscas": e_moscas,
    "cheiro_ruim": e_cheiro_ruim, "brilho": e_brilho, "coracoes": e_coracoes, "notas": e_notas, "zzz": e_zzz, "suor": e_suor,
    "raiva": e_raiva, "confete": e_confete, "balao_pensamento": e_balao_pensamento, "balao_fala": e_balao_fala,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    R = os.path.abspath(argv[0])
    ids = argv[1:] or list(EFEITOS)
    for id_ in ids:
        limpa()
        bpy.context.scene.frame_end = 1
        EFEITOS[id_](R)
        caminho = os.path.join(R, id_, id_ + ".glb")
        info = exporta(None, caminho)
        laco = bpy.data.objects[f"efeito_{id_}"]["laco"]
        js_p = os.path.join(R, id_, id_ + ".json")
        js = json.load(open(js_p, encoding="utf-8")) if os.path.exists(js_p) else {"id": id_}
        js["glb"] = {"arquivo": f"{id_}.glb", "laco": laco, "animacao": "laco", "triangulos": info["tris"],
                     "bytes": info["bytes"], "extras": info["extras"]}
        with open(js_p, "w", encoding="utf-8") as f:
            json.dump(js, f, ensure_ascii=False, indent=1)
        print(f"ok {id_}: {info['tris']} tri, {info['bytes'] // 1024} KB, anim {info['animacoes']}", flush=True)


if __name__ == "__main__":
    main()
