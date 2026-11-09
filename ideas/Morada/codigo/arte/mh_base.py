"""Base anatômica CC0 (MakeHuman/MPFB) para os personagens do Morada.

Funções puras sobre a malha base hm08 (espaço MakeHuman: decímetros, Y para cima) e a montagem
no Blender (metros, Z para cima) com o esqueleto Mixamo do MPFB ajustado à pose T do Ch46.
Licença dos dados usados: CC0 (MakeHuman 1.1 e MPFB2, LICENSE.ASSETS.md).
"""
import json
import math
import os
import re

import bpy
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

P = "mixamorig:"


# ------------------------------------------------------------------ leitura
def ler_obj(caminho):
    vs, vts, faces = [], [], []
    grupo = "body"
    with open(caminho) as f:
        for ln in f:
            if ln.startswith("v "):
                _, x, y, z = ln.split()[:4]
                vs.append([float(x), float(y), float(z)])
            elif ln.startswith("vt "):
                _, u, v = ln.split()[:3]
                vts.append((float(u), float(v)))
            elif ln.startswith("g "):
                grupo = ln.split()[1]
            elif ln.startswith("f "):
                vi, ti = [], []
                for tok in ln.split()[1:]:
                    p = tok.split("/")
                    vi.append(int(p[0]) - 1)
                    ti.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                faces.append((vi, ti, grupo))
    return vs, vts, faces


def ler_target(caminho):
    d = {}
    with open(caminho) as f:
        for ln in f:
            if not ln or ln[0] == "#":
                continue
            p = ln.split()
            if len(p) == 4:
                d[int(p[0])] = (float(p[1]), float(p[2]), float(p[3]))
    return d


def aplicar_target(vs, tgt, peso):
    if peso == 0:
        return
    for i, (dx, dy, dz) in tgt.items():
        v = vs[i]
        v[0] += dx * peso
        v[1] += dy * peso
        v[2] += dz * peso


# ------------------------------------------------------------------ macros do MakeHuman
def pesos_idade(anos):
    if anos < 11:
        a = (anos - 1) / 10 * 0.1875
    elif anos < 25:
        a = 0.1875 + (anos - 11) / 14 * 0.3125
    else:
        a = 0.5 + (anos - 25) / 65 * 0.5
    a = max(0.0, min(1.0, a))
    if a < 0.1875:
        t = a / 0.1875
        return {"baby": 1 - t, "child": t}
    if a < 0.5:
        t = (a - 0.1875) / 0.3125
        return {"child": 1 - t, "young": t}
    t = (a - 0.5) / 0.5
    return {"young": 1 - t, "old": t}


def tres(v, nomes):
    """0..1 com 0,5 = médio → pesos para (min, average, max)."""
    if v < 0.5:
        t = v / 0.5
        return {nomes[0]: 1 - t, nomes[1]: t}
    t = (v - 0.5) / 0.5
    return {nomes[1]: 1 - t, nomes[2]: t}


def macros(vs, data, genero, anos, musculo=0.5, peso=0.5, etnia=None):
    etnia = etnia or {"caucasian": 0.34, "african": 0.33, "asian": 0.33}
    tgt_dir = os.path.join(data, "targets", "macrodetails")
    gw = {"female": 1 - genero, "male": genero}
    aw = pesos_idade(anos)
    for g, wg in gw.items():
        for a, wa in aw.items():
            if wg * wa == 0:
                continue
            for r, wr in etnia.items():
                aplicar_target(vs, ler_target(os.path.join(tgt_dir, f"{r}-{g}-{a}.target")), wg * wa * wr)
            for m, wm in tres(musculo, ("minmuscle", "averagemuscle", "maxmuscle")).items():
                for p, wp in tres(peso, ("minweight", "averageweight", "maxweight")).items():
                    w = wg * wa * wm * wp
                    caminho = os.path.join(tgt_dir, f"universal-{g}-{a}-{m}-{p}.target")
                    if w and os.path.exists(caminho):
                        aplicar_target(vs, ler_target(caminho), w)


def expressao(vs, data, unidades, etnia=None):
    etnia = etnia or {"caucasian": 0.34, "african": 0.33, "asian": 0.33}
    for nome, w in unidades.items():
        for r, wr in etnia.items():
            caminho = os.path.join(data, "targets", "expression", "units", r, nome + ".target")
            if os.path.exists(caminho):
                aplicar_target(vs, ler_target(caminho), w * wr)


def detalhe(vs, data, caminho_rel, w):
    caminho = os.path.join(data, "targets", caminho_rel)
    if os.path.exists(caminho):
        aplicar_target(vs, ler_target(caminho), w)
    else:
        print("target ausente:", caminho_rel)


# ------------------------------------------------------------------ estilização (espaço MH)
def centro_grupo(vs, faces, nome):
    idx = {i for vi, _, g in faces if g == nome for i in vi}
    n = len(idx)
    return [sum(vs[i][k] for i in idx) / n for k in range(3)], idx


def estilizar(vs, faces, cabeca=1.18, olhos=1.15):
    """Cabeça e olhos maiores mantendo a anatomia (cartoon realista)."""
    (le, li) = centro_grupo(vs, faces, "helper-l-eye")
    (re_, ri) = centro_grupo(vs, faces, "helper-r-eye")
    topo = max(v[1] for v in vs)
    queixo = le[1] - (topo - le[1]) * 1.05
    centro = [0.0, (topo + queixo) / 2, (le[2] + re_[2]) / 2 - 0.25]
    pesc0, pesc1 = queixo - 0.9, queixo - 0.1  # transição no pescoço (dm)
    raio_olho = max(math.dist(vs[i], le) for i in li)
    for v in vs:
        t = min(1.0, max(0.0, (v[1] - pesc0) / (pesc1 - pesc0)))
        t = t * t * (3 - 2 * t)
        k = 1 + (cabeca - 1) * t
        if k != 1:
            v[0] = centro[0] + (v[0] - centro[0]) * k
            v[2] = centro[2] + (v[2] - centro[2]) * k
            v[1] = pesc1 + (v[1] - pesc1) * k if v[1] > pesc1 else v[1]
    for c, ids in ((le, li), (re_, ri)):
        c2 = [sum(vs[i][k] for i in ids) / len(ids) for k in range(3)]
        r = raio_olho * cabeca * 2.1
        for v in vs:
            d = math.dist(v, c2)
            if d < r:
                s = 1 - d / r
                s = s * s * (3 - 2 * s)
                k = 1 + (olhos - 1) * s
                for a in range(3):
                    v[a] = c2[a] + (v[a] - c2[a]) * k


# ------------------------------------------------------------------ peças encaixadas (mhclo)
def encaixar_mhclo(caminho_mhclo, vs):
    base = os.path.dirname(caminho_mhclo)
    escala = {}
    refs = []
    obj = None
    em_verts = False
    with open(caminho_mhclo) as f:
        for ln in f:
            s = ln.strip()
            if not s or s.startswith("#"):
                continue
            if em_verts:
                p = s.split()
                if len(p) == 9:
                    refs.append(([int(x) for x in p[:3]], [float(x) for x in p[3:6]], [float(x) for x in p[6:9]]))
                    continue
                if len(p) == 1 and p[0].isdigit():
                    refs.append(([int(p[0])] * 3, [1.0, 0, 0], [0, 0, 0]))
                    continue
                em_verts = False
            if s.startswith("obj_file"):
                obj = os.path.join(base, s.split()[1])
            m = re.match(r"([xyz])_scale (\d+) (\d+) ([\d.]+)", s)
            if m:
                ax = "xyz".index(m.group(1))
                a, b = int(m.group(2)), int(m.group(3))
                escala[ax] = abs(vs[a][ax] - vs[b][ax]) / float(m.group(4))
            if s.startswith("verts"):
                em_verts = True
    pvs, pvts, pfaces = ler_obj(obj)
    out = []
    for (i1, i2, i3), (w1, w2, w3), d in refs:
        out.append([w1 * vs[i1][k] + w2 * vs[i2][k] + w3 * vs[i3][k] + d[k] * escala.get(k, 1.0) for k in range(3)])
    return out, pvts, pfaces


# ------------------------------------------------------------------ Blender
CHAO = [0.0]
GRUPOS = {}


def definir_chao(vs, faces):
    """A malha base fica centrada na origem; os pés vão para z = 0. Guarda também os grupos (juntas)."""
    GRUPOS.clear()
    for vi, _, g in faces:
        GRUPOS.setdefault(g, set()).update(vi)
    CHAO[0] = min(vs[i][1] for i in GRUPOS["body"])


def mh_para_blender(v):
    return Vector((v[0] * 0.1, -v[2] * 0.1, (v[1] - CHAO[0]) * 0.1))


def criar_malha(nome, vs, vts, faces, grupos=None, materiais=None):
    """grupos: conjunto de nomes de grupo a manter (None = todos). Mantém índices originais dos vértices."""
    usar = [f for f in faces if grupos is None or f[2] in grupos]
    me = bpy.data.meshes.new(nome)
    me.from_pydata([tuple(mh_para_blender(v)) for v in vs], [], [f[0] for f in usar])
    if vts:
        uv = me.uv_layers.new(name="UVMap")
        li = 0
        for f in usar:
            for t in f[1]:
                uv.data[li].uv = vts[t] if t >= 0 else (0, 0)
                li += 1
    if materiais:
        nomes = list(materiais.keys())
        for m in materiais.values():
            me.materials.append(m)
        for poly, f in zip(me.polygons, usar):
            for k, padrao in enumerate(nomes):
                if re.match(padrao, f[2]):
                    poly.material_index = k
                    break
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def limpar_soltos(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    soltos = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=soltos, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()


def pesos_mixamo(ob, caminho_pesos, so_existentes=True):
    w = json.load(open(caminho_pesos))["weights"]
    for osso, lista in w.items():
        g = ob.vertex_groups.get(osso) or ob.vertex_groups.new(name=osso)
        por_peso = {}
        for i, val in lista:
            por_peso.setdefault(round(val, 4), []).append(i)
        n = len(ob.data.vertices)
        for val, ids in por_peso.items():
            ids = [i for i in ids if i < n]
            if ids:
                g.add(ids, val, "REPLACE")


def esqueleto_mpfb(nome, caminho_rig, vs_mh, base_ch46):
    """Cria o esqueleto Mixamo do MPFB nas posições da malha (pose A) com a mesma transformação de objeto do Ch46."""
    rig = json.load(open(caminho_rig))["bones"]
    arm_d = bpy.data.armatures.new(nome)
    arm = bpy.data.objects.new(nome, arm_d)
    bpy.context.scene.collection.objects.link(arm)
    arm.matrix_world = base_ch46.matrix_world.copy()
    inv = arm.matrix_world.inverted()

    def pos(spec):
        if spec.get("cube_name") and spec["cube_name"] in GRUPOS:
            ids = GRUPOS[spec["cube_name"]]
            pts = [mh_para_blender(vs_mh[i]) for i in ids]
            return sum(pts, Vector()) / len(pts)
        if spec.get("vertex_indices"):
            pts = [mh_para_blender(vs_mh[i]) for i in spec["vertex_indices"]]
            return sum(pts, Vector()) / len(pts)
        return Vector(spec["default_position"])

    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    ebs = {}
    for bn, b in rig.items():
        eb = arm_d.edit_bones.new(bn)
        eb.head = inv @ pos(b["head"])
        eb.tail = inv @ pos(b["tail"])
        eb.roll = b.get("roll", 0.0)
        ebs[bn] = eb
    for bn, b in rig.items():
        if b.get("parent"):
            ebs[bn].parent = ebs[b["parent"]]
            ebs[bn].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def ajustar_pose_t(arm, malhas, base_ch46):
    """1) gira só os membros para a pose T do Ch46 e assa na malha; 2) iguala a orientação de repouso
    de todos os ossos à do Ch46 (direção e roll), sem mexer na malha. As animações do Mixamo passam
    a valer sem retarget, porque os eixos locais ficam iguais aos do Ch46."""
    MEMBROS = ("Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase")
    bpy.context.view_layer.update()
    ch = {b.name: b for b in base_ch46.data.bones}
    MWc = base_ch46.matrix_world
    inv_a = arm.matrix_world.inverted()

    def dir_ch(nome):
        b = ch[nome]
        return (inv_a.to_3x3() @ (MWc @ b.tail_local - MWc @ b.head_local)).normalized()

    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    ordem = sorted(arm.pose.bones, key=lambda pb: len(pb.parent_recursive))
    for pb in ordem:
        curto = pb.name.replace(P, "").replace("Left", "").replace("Right", "")
        if pb.name not in ch or curto not in MEMBROS:
            continue
        alvo = dir_ch(pb.name)
        M = pb.matrix.copy()
        atual = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
        q = atual.rotation_difference(alvo)
        t = M.translation
        pb.matrix = Matrix.Translation(t) @ q.to_matrix().to_4x4() @ Matrix.Translation(-t) @ M
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    for ob in malhas:
        for o in bpy.context.selected_objects:
            o.select_set(False)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        mod = next(m for m in ob.modifiers if m.type == "ARMATURE")
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in arm.data.edit_bones:
        if eb.name in ch:
            comp = (eb.tail - eb.head).length
            eb.tail = eb.head + dir_ch(eb.name) * comp
            z_w = (MWc.to_3x3() @ (ch[eb.name].matrix_local.to_3x3() @ Vector((0, 0, 1)))).normalized()
            eb.align_roll(inv_a.to_3x3() @ z_w)
    bpy.ops.object.mode_set(mode="OBJECT")
    for ob in malhas:
        m = ob.modifiers.new("Esqueleto", "ARMATURE")
        m.object = arm
