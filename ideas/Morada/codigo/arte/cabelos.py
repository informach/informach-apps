"""Catálogo de cabelos (cabelos.json) e encaixe de um item do catálogo na cabeça de um corpo.

O encaixe usa a cabeça do personagem de origem como régua: a caixa dos pontos presos ao osso Head dele é levada à caixa
da cabeça do corpo (escala e posição por eixo). Barba e bigode ('tipo': rosto) ainda andam para a frente o quanto for
preciso para não afundar no rosto. A peça fica presa só ao osso Head, com o modificador de esqueleto.
Usado por corpos.py (ao gerar os corpos) e por tools/adiciona_cabelo.py (para acrescentar itens a corpos prontos).
"""
import json
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
