"""Catálogo de cabelos (cabelos.json) e encaixe de um item do catálogo na cabeça de um corpo.

O encaixe usa a cabeça do personagem de origem como régua: a caixa dos pontos presos ao osso Head dele é levada à caixa
da cabeça do corpo (escala e posição por eixo). Barba e bigode ('tipo': rosto) ainda andam para a frente o quanto for
preciso para não afundar no rosto. A peça fica presa só ao osso Head, com o modificador de esqueleto.
Usado por corpos.py (ao gerar os corpos) e por tools/adiciona_cabelo.py (para acrescentar itens a corpos prontos).
"""
import json
import math
import os

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

AQUI = os.path.dirname(os.path.abspath(__file__))
CATALOGO = json.load(open(os.path.join(AQUI, "cabelos.json")))
_BRUTOS = {x["id"]: x for x in CATALOGO["itens"]}


def _resolve(x):
    """Variação ("base": outro penteado, "forma": comprido/volume/achatado/rente/corta_lados) herda arquivo, peças e tipo."""
    if "base" not in x:
        return x
    b = _resolve(_BRUTOS[x["base"]])
    return {**{k: v for k, v in b.items() if k not in ("id", "rotulo", "forma", "base")}, **x}


ITENS = {k: _resolve(v) for k, v in _BRUTOS.items()}
CATALOGO["itens"] = [ITENS[x["id"]] for x in CATALOGO["itens"]]


def eh_pelo(papel):
    """Malhas que usam o material e a cor do cabelo: o cabelo original, o raspado e os itens do catálogo."""
    return papel in ("cabelo", "cabelo_raspado") or papel in ITENS


def permitido(item, corpo_nome, base=None):
    """O item serve neste corpo? (grupo 'so' do catálogo; o cabelo original da base já é o 'cabelo' do corpo)"""
    so = item.get("so")
    if so:
        grupo = CATALOGO["grupos"].get(so, [so]) if isinstance(so, str) else so
        if corpo_nome not in grupo:
            return False
    return base is None or CATALOGO["originais"].get(base) != item["id"]


def itens_para(corpo_nome, base):
    return [x for x in CATALOGO["itens"] if permitido(x, corpo_nome, base)]


def pos_mundo(o):
    mw = o.matrix_world
    return np.array([mw @ v.co for v in o.data.vertices])


def grava_mundo(o, P):
    mi = o.matrix_world.inverted()
    for v, p in zip(o.data.vertices, P):
        v.co = mi @ Vector(p)
    o.data.update()


def peso(o, nomes):
    idx = {o.vertex_groups[n].index for n in nomes if n in o.vertex_groups}
    return np.array([sum(g.weight for g in v.groups if g.group in idx) for v in o.data.vertices])


def caixa_cabeca(o):
    """Caixa da cabeça (pontos presos ao osso Head) no mundo: mínimo e máximo."""
    P = pos_mundo(o)
    w = peso(o, ["Head"])
    H = P[w > 0.5] if (w > 0.5).sum() > 10 else P
    return H.min(0), H.max(0)


def afunda(corpo, P):
    """Quanto (em y, para a frente) a peça precisa andar para quase nenhum ponto dela ficar dentro da pele."""
    Q = pos_mundo(corpo)
    bvh = BVHTree.FromPolygons([tuple(q) for q in Q], [tuple(f.vertices) for f in corpo.data.polygons])
    dentro = []
    for p in P:
        loc, nrm, _, d = bvh.find_nearest(Vector(p))
        if loc is not None and (Vector(p) - loc).dot(nrm) < 0:
            dentro.append(d)
    if len(dentro) < 0.05 * len(P):
        return 0.0
    return float(np.percentile(dentro, 90)) + 0.002


def uv_faixa(o, u_alvo, v_alvo):
    """Leva o mapa UV da peça para uma faixa da paleta (a cor do cabelo no arquivo; no jogo a cor é do material)."""
    uv = o.data.uv_layers.active.data
    us = np.array([d.uv[:] for d in uv])
    v0, v1 = us[:, 1].min(), us[:, 1].max()
    du = u_alvo - us[:, 0].mean()
    for d, (u, v) in zip(uv, us):
        t = 0.5 if v1 - v0 < 1e-6 else (v - v0) / (v1 - v0)
        d.uv = (u + du, v_alvo[0] + t * (v_alvo[1] - v_alvo[0]))


def _forma_cabelo(forma):
    """Variações de penteado, no espaço de origem, pela caixa da cabeça: 'comprido' (o que está abaixo da metade da
    cabeça desce), 'volume' (mais largo), 'achatado' (rente no alto, para caber debaixo de chapéu), 'rente' (barba mais
    curta, junto do rosto) e 'corta_lados' (cavanhaque: só o meio)."""
    def ajusta(cab, corpo_s):
        import bmesh
        hmin, hmax = caixa_cabeca(corpo_s)
        c = (hmin + hmax) / 2
        H = hmax[2] - hmin[2]
        L = hmax[0] - hmin[0]
        P = pos_mundo(cab)
        if forma.get("comprido"):
            z_meio = hmin[2] + 0.5 * H
            ab = P[:, 2] < z_meio
            P[ab, 2] = z_meio - (z_meio - P[ab, 2]) * forma["comprido"]
            # a ponta abre um pouco para fora (não entra no pescoço e nos ombros)
            t = np.clip((z_meio - P[:, 2]) / H, 0, None)
            P[ab, :2] = c[:2] + (P[ab, :2] - c[:2]) * (1 + 0.12 * t[ab, None])
        if forma.get("volume"):
            v = forma["volume"]
            P[:, :2] = c[:2] + (P[:, :2] - c[:2]) * v
            alto = P[:, 2] > c[2]
            P[alto, 2] = c[2] + (P[alto, 2] - c[2]) * (1 + (v - 1) * 0.6)
        if forma.get("achatado"):
            topo = hmax[2] + 0.01 * H
            alto = P[:, 2] > topo
            P[alto, 2] = topo + (P[alto, 2] - topo) * 0.25
        if forma.get("rente"):
            P = c + (P - c) * forma["rente"]
        mi = cab.matrix_world.inverted()
        for v_, p in zip(cab.data.vertices, P):
            v_.co = mi @ Vector(p)
        cab.data.update()
        extras = []
        if forma.get("rabo") or forma.get("coque") or forma.get("trancas") or forma.get("crista") or forma.get("espetos") \
                or forma.get("coque_duplo"):
            import bmesh as _bm
            bm = _bm.new()
            bm.from_mesh(cab.data)
            uvl = bm.loops.layers.uv.active
            uv0 = None
            if uvl:
                for f in bm.faces:
                    uv0 = f.loops[0][uvl].uv.copy()
                    break
            mw = cab.matrix_world
            mi = mw.inverted()
            novos = []

            def tubo(pontos, raios):
                aneis = []
                for (p, r) in zip(pontos, raios):
                    aneis.append([bm.verts.new(mi @ Vector((p[0] + r * math.cos(t), p[1] + r * math.sin(t) * 0.9, p[2])))
                                  for t in np.linspace(0, 2 * math.pi, 12, endpoint=False)])
                for a_, b_ in zip(aneis, aneis[1:]):
                    for k in range(12):
                        novos.append(bm.faces.new((a_[k], a_[(k + 1) % 12], b_[(k + 1) % 12], b_[k])))
                fim = bm.verts.new(mi @ Vector(pontos[-1]) + (mi.to_3x3() @ Vector((0, 0, -raios[-1]))))
                for k in range(12):
                    novos.append(bm.faces.new((aneis[-1][k], aneis[-1][(k + 1) % 12], fim)))
            if forma.get("espetos"):  # espetado: pontas cônicas saindo do alto e da frente do cabelo
                import random
                rnd = random.Random(5)
                P0 = np.array([mw @ v.co for v in bm.verts])
                alto = P0[P0[:, 2] > c[2] + 0.18 * H]
                nesp = int(forma.get("n", 26))
                ga = math.pi * (3 - math.sqrt(5))
                for i in range(nesp):
                    zf = 1 - (i + 0.5) / nesp * 0.75  # só o alto da cabeça (calota)
                    rr = math.sqrt(max(1 - zf * zf, 0))
                    d = np.array([math.cos(ga * i) * rr, math.sin(ga * i) * rr, zf])
                    if d[1] > 0.55:  # nuca: sem pontas
                        continue
                    alvo = c + d * 2 * H
                    p0 = alto[np.argmax(alto @ d)] if len(alto) else c + d * 0.5 * H
                    nrm = (p0 - c) / max(np.linalg.norm(p0 - c), 1e-6)
                    nrm = nrm + np.array([0, 0.35, 0.25])  # para trás e para cima
                    nrm /= np.linalg.norm(nrm)
                    hh = forma["espetos"] * H * rnd.uniform(0.75, 1.15)
                    rb = 0.075 * H * rnd.uniform(0.85, 1.1)
                    base_ = p0 - nrm * 0.05 * H
                    t1 = np.cross(nrm, [1, 0, 0]) if abs(nrm[0]) < 0.9 else np.cross(nrm, [0, 1, 0])
                    t1 /= np.linalg.norm(t1)
                    t2 = np.cross(nrm, t1)
                    anel = [bm.verts.new(mi @ Vector(base_ + (t1 * math.cos(a) + t2 * math.sin(a)) * rb)) for a in np.linspace(0, 2 * math.pi, 7, endpoint=False)]
                    ponta = bm.verts.new(mi @ Vector(base_ + nrm * (hh + 0.05 * H)))
                    for k in range(7):
                        novos.append(bm.faces.new((anel[k], anel[(k + 1) % 7], ponta)))
            if forma.get("coque_duplo"):  # dois coques no alto, um de cada lado
                for sx in (-1, 1):
                    r = _bm.ops.create_icosphere(bm, subdivisions=2, radius=forma["coque_duplo"] * H)
                    for v in r["verts"]:
                        v.co = mi @ (Vector((c[0] + sx * 0.3 * (hmax[0] - hmin[0]), c[1] + 0.05 * H, hmax[2] - 0.02 * H)) + v.co)
                    novos += list({f for v in r["verts"] for f in v.link_faces})
            if forma.get("rabo"):  # rabo de cavalo: preso atrás, no alto, descendo até a nuca e o pescoço
                comp = forma["rabo"] * H
                base = np.array([c[0], hmax[1] + 0.02 * H, hmin[2] + forma.get("rabo_altura", 0.72) * H])
                pts = [base + np.array([0, 0.06 * H * t, -comp * t ** 1.2]) for t in np.linspace(0, 1, 7)]
                tubo(pts, [0.13 * H * (1 - 0.65 * t) * (1.15 if 0 < t < 0.3 else 1) + 0.025 * H for t in np.linspace(0, 1, 7)])
            if forma.get("trancas"):  # duas tranças dos lados
                comp = forma["trancas"] * H
                for sx in (-1, 1):
                    base = np.array([c[0] + sx * (hmax[0] - c[0]) * 0.85, c[1] + 0.05 * H, hmin[2] + 0.45 * H])
                    pts = [base + np.array([sx * 0.02 * H * t, 0.03 * H * t, -comp * t]) for t in np.linspace(0, 1, 8)]
                    tubo(pts, [0.085 * H * (1 - 0.4 * t) * (1 + 0.18 * math.sin(t * 25)) for t in np.linspace(0, 1, 8)])
            if forma.get("crista"):  # moicano: crista do alto da testa até a nuca (os lados raspados)
                if forma.get("so_crista"):
                    _bm.ops.delete(bm, geom=[v for v in bm.verts], context="VERTS")
                hc = forma["crista"] * H
                larg = forma.get("largura", 0.05) * H
                ry_, rz_ = (hmax[1] - hmin[1]) / 2 * 0.93, (hmax[2] - c[2]) * 0.95
                aneis = []
                angs = np.linspace(math.radians(25), math.radians(165), 15)
                for a in angs:
                    p0 = np.array([c[0], c[1] - ry_ * math.cos(a), c[2] + rz_ * math.sin(a)])
                    n = np.array([0, -math.cos(a), math.sin(a)])
                    h = hc * (0.55 + 0.45 * math.sin(a))
                    anel = []
                    for t in np.linspace(0, 2 * math.pi, 12, endpoint=False):
                        q = p0 + np.array([larg * math.cos(t) * (1 - 0.6 * max(math.sin(t), 0)), 0, 0]) \
                            + n * (h * (0.5 + 0.5 * math.sin(t)) - 0.02 * H)
                        anel.append(bm.verts.new(mi @ Vector(q)))
                    aneis.append(anel)
                for a_, b_ in zip(aneis, aneis[1:]):
                    for k in range(12):
                        novos.append(bm.faces.new((a_[k], a_[(k + 1) % 12], b_[(k + 1) % 12], b_[k])))
                for anel in (aneis[0], aneis[-1]):
                    novos.append(bm.faces.new(anel))
            if forma.get("coque"):  # coque no alto e atrás
                r = _bm.ops.create_icosphere(bm, subdivisions=2, radius=forma["coque"] * H)
                for v in r["verts"]:
                    v.co = mi @ (Vector((c[0], c[1] + 0.25 * (hmax[1] - c[1]), hmax[2] + 0.05 * H)) + v.co)
                novos += list({f for v in r["verts"] for f in v.link_faces})
            if uvl and uv0 is not None:
                for f in novos:
                    for lo in f.loops:
                        lo[uvl].uv = uv0
            _bm.ops.recalc_face_normals(bm, faces=novos)
            bm.to_mesh(cab.data)
            bm.free()
            cab.data.update()
        if forma.get("corta_lados"):
            bm = bmesh.new()
            bm.from_mesh(cab.data)
            mw = cab.matrix_world
            lim = forma["corta_lados"] * L / 2
            bmesh.ops.delete(bm, geom=[v_ for v_ in bm.verts if abs((mw @ v_.co).x - c[0]) > lim], context="VERTS")
            bm.to_mesh(cab.data)
            bm.free()
            cab.data.update()
    return ajusta


def encaixa(item, arm, corpo, pasta_pacotes, ajuste=None):
    """Importa a peça do item, encaixa na cabeça de 'corpo' e prende ao osso Head de 'arm'. Devolve o objeto.
    ajuste(peça, corpo de origem): muda a peça no espaço de origem antes do encaixe (variações de chapéu)."""
    antes, acoes_antes = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(pasta_pacotes, item["arquivo"]))
    objs = [o for o in bpy.data.objects if o not in antes]
    for a_ in set(bpy.data.actions) - acoes_antes:
        bpy.data.actions.remove(a_)
    arm_s = next((o for o in objs if o.type == "ARMATURE"), None)
    if arm_s:
        arm_s.animation_data_clear()
        for pb in arm_s.pose.bones:
            pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    corpo_s = next(o for o in objs if o.name.split(".")[0] == item["corpo_origem"])
    juntar = [o for o in objs if o.name.split(".")[0] in item["pecas"]]
    cab = juntar[0]
    if len(juntar) > 1:
        ptrs = {o.as_pointer() for o in juntar[1:]}
        objs = [o for o in objs if o.as_pointer() not in ptrs]
        with bpy.context.temp_override(active_object=cab, selected_editable_objects=juntar):
            bpy.ops.object.join()
    if ajuste is None and item.get("forma"):
        ajuste = _forma_cabelo(item["forma"])
    if ajuste is not None:
        ajuste(cab, corpo_s)
    s_min, s_max = caixa_cabeca(corpo_s)
    alvo_min, alvo_max = caixa_cabeca(corpo)
    esc = (alvo_max - alvo_min) / np.maximum(s_max - s_min, 1e-6)
    P = alvo_min + (pos_mundo(cab) - s_min) * esc
    if item["tipo"] == "rosto":  # a cabeça de origem tem outra fundura: a peça não pode afundar no rosto
        P = P + np.array([0.0, -afunda(corpo, P), 0.0])
    mw = cab.matrix_world.copy()
    cab.parent = arm
    cab.matrix_world = mw
    grava_mundo(cab, P)
    for vg in list(cab.vertex_groups):
        cab.vertex_groups.remove(vg)
    g = cab.vertex_groups.new(name="Head")
    g.add(list(range(len(cab.data.vertices))), 1.0, "REPLACE")
    for m in list(cab.modifiers):
        cab.modifiers.remove(m)
    cab.modifiers.new("Esqueleto", "ARMATURE").object = arm
    for o in objs:
        if o is not cab:
            bpy.data.objects.remove(o, do_unlink=True)
    return cab



CORTE_CHAPEU, NUCA_CHAPEU = 0.58, 0.12


def sob_chapeu(arm, corpo):
    """Cabelo sob o chapéu no arquivo-mestre: cada cabelo do corpo ganha a forma "sob_chapeu", em que o que fica acima
    da linha da aba (58% da altura da cabeça na frente, 12% mais baixo na nuca) entra para dentro da cabeça, e o resto
    fica como está. A forma é ligada (driver) à propriedade "com_chapeu" (0 ou 1) do esqueleto. É a mesma ideia da
    página e do jogo (lá, o corte usa a altura da aba de cada chapéu). Devolve quantos cabelos ganharam a forma."""
    if "com_chapeu" not in arm:
        arm["com_chapeu"] = 0.0
        arm.id_properties_ui("com_chapeu").update(min=0.0, max=1.0, description="1 com chapéu: o cabelo fica sob a aba")
    c = arm.name
    hmin, hmax = caixa_cabeca(corpo)
    cen = Vector((hmin + hmax) / 2)
    Hc, ry = hmax[2] - hmin[2], (hmax[1] - hmin[1]) / 2
    P = [corpo.matrix_world @ v.co for v in corpo.data.vertices]
    bvh = BVHTree.FromPolygons([tuple(p) for p in P], [tuple(f.vertices) for f in corpo.data.polygons])
    feitos = 0
    for o in [o for o in bpy.data.objects if o.type == "MESH" and o.parent is arm]:
        papel = o.name[len(c) + 1:]
        if papel not in ("cabelo", "cabelo_raspado") and (papel not in ITENS or ITENS[papel].get("tipo") == "rosto"):
            continue
        if not o.data.shape_keys:
            o.shape_key_add(name="Basis", from_mix=False)
        kb = o.data.shape_keys.key_blocks.get("sob_chapeu") or o.shape_key_add(name="sob_chapeu", from_mix=False)
        mw, mi = o.matrix_world, o.matrix_world.inverted()
        for i, d in enumerate(o.data.shape_keys.key_blocks["Basis"].data):
            p = mw @ d.co
            tras = min(max((p.y - cen.y) / ry, 0.0), 1.0)  # a aba desce na nuca (+y é a nuca)
            if p.z <= hmin[2] + (CORTE_CHAPEU - NUCA_CHAPEU * tras) * Hc:
                kb.data[i].co = d.co
                continue
            dirc = (p - cen).normalized()
            hit = bvh.ray_cast(cen, dirc, 1.0)
            r = (hit[0] - cen).length - 0.004 if hit[0] is not None else (p - cen).length * 0.85
            kb.data[i].co = mi @ (cen + dirc * max(r, 0.01))
        kb.value = 0.0
        kb.driver_remove("value")
        fc = kb.driver_add("value")
        fc.driver.type = "AVERAGE"
        var = fc.driver.variables.new()
        var.name = "com_chapeu"
        var.targets[0].id = arm
        var.targets[0].data_path = '["com_chapeu"]'
        feitos += 1
    return feitos
