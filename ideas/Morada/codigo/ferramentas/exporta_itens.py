"""Peças (roupas, acessórios e cabelos dos catálogos) em arquivos separados, montadas no corpo pela página e pelo jogo.

Cada peça é encaixada uma vez em cada malha-base do pacote (família m, f e p: os nossos corpos são deformações delas,
com a mesma malha) e guardada como ligação à pele:
  - tipo "pele": para cada ponto da peça, o triângulo da malha-base (índice na tabela de triângulos da família), as
    baricêntricas e o deslocamento no referencial do triângulo (direção da aresta 0→1, normal × essa direção, normal;
    em metros). No corpo: ponto = p + s·(e1·o₀ + e2·o₁ + n·o₂), com p e n interpolados no triângulo do corpo (normais
    somadas pelas áreas, na própria malha) e s = √(área no corpo ÷ área na base). Assim a peça acompanha a criança, o
    plus, o idoso e, recalculada com as formas do corpo, a barriga de gravidez. Pesos do esqueleto: os da pele embaixo.
  - tipo "cabeca": a peça na caixa da cabeça da malha-base, em coordenadas de 0 a 1; no corpo, levada à caixa da cabeça
    dele (pontos presos ao osso Head) e presa só ao osso Head.

Arquivos (em <saida>):
  itens/<id>.txt   gzip + base64 de: "MIT1", u32 tamanho do cabeçalho, cabeçalho JSON, blocos binários (little-endian)
  familias.txt     gzip + base64 de JSON: por família, triângulos (índices de vértice da malha-base) e áreas
  e as máscaras de cor (roupas_mascaras/), como antes.

Uso: python exporta_itens.py -- <saida> [ids separados por vírgula | todos]
"""
import base64
import gzip
import json
import os
import struct
import sys

import bpy
import numpy as np

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(AQUI, "morada-art"))
import roupas as R  # noqa: E402
import cabelos as CAB  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
SAIDA = a[0]
IDS = a[1] if len(a) > 1 else "todos"
PACOTES = os.path.join(AQUI, "ideias")
os.makedirs(os.path.join(SAIDA, "itens"), exist_ok=True)
FAMS = ("m", "f", "p")
bpy.ops.wm.read_factory_settings(use_empty=True)


def base_obj(fam):
    arq, nome = R.BASES[fam]
    X = R.importa(arq, PACOTES)[nome]
    arm = next(m.object for m in X.modifiers if m.type == "ARMATURE")
    return X, arm


def blocos(partes):
    """Junta blocos binários; devolve (bytes, {nome: [início, tamanho, tipo]})."""
    buf, idx, pos = bytearray(), {}, 0
    for nome, arr in partes:
        b = np.ascontiguousarray(arr).tobytes()
        pad = (-len(buf)) % 4
        buf += b"\0" * pad
        idx[nome] = [len(buf), len(b), str(arr.dtype)]
        buf += b
    return bytes(buf), idx


def grava(caminho, cabecalho, partes):
    corpo, idx = blocos(partes)
    cabecalho["blocos"] = idx
    h = json.dumps(cabecalho, ensure_ascii=False, separators=(",", ":")).encode()
    h += b" " * ((-len(h)) % 4)
    dados = b"MIT1" + struct.pack("<I", len(h)) + h + corpo
    open(caminho, "w").write(base64.b64encode(gzip.compress(dados, 9)).decode())


def geometria(ob):
    """Triângulos, UV por vértice (os vértices são separados onde o UV ou o material muda) e grupos por material."""
    me = ob.data
    me.calc_loop_triangles()
    uv = me.uv_layers.active.data if me.uv_layers.active else None
    chave, vert_de, uvs, tri_por_mat = {}, [], [], {}
    for lt in me.loop_triangles:
        t = []
        for li in lt.loops:
            vi = me.loops[li].vertex_index
            u = tuple(round(x, 6) for x in uv[li].uv) if uv else (0.0, 0.0)
            k = (vi, u)
            if k not in chave:
                chave[k] = len(vert_de)
                vert_de.append(vi)
                uvs.append(u)
            t.append(chave[k])
        tri_por_mat.setdefault(lt.material_index, []).append(t)
    idx, grupos = [], []
    for mi in sorted(tri_por_mat):
        ini = len(idx) * 3
        idx += tri_por_mat[mi]
        m = me.materials[mi] if mi < len(me.materials) and me.materials[mi] else None
        grupos.append([ini, len(tri_por_mat[mi]) * 3, m.name if m else "Roupa"])
    return np.array(vert_de), np.array(uvs, np.float32), np.array(idx, np.uint32 if len(vert_de) > 65535 else np.uint16), grupos


def liga_pele(Pg, X):
    M = R.Malha(R.pos_mundo(X), R.tris_de(X.data))
    tri = np.zeros(len(Pg), np.uint16)
    bar = np.zeros((len(Pg), 2), np.float32)
    off = np.zeros((len(Pg), 3), np.float32)
    for j, g in enumerate(Pg):
        i, b, _, _ = M.perto(g)
        p, n, e1, e2 = M.referencial(i, b)
        o = g - p
        tri[j], bar[j], off[j] = i, b[:2], (o @ e1, o @ e2, o @ n)
    return tri, bar, off


# tabela das famílias (a página usa a mesma ordem de triângulos e as mesmas áreas)
fam_info = {}
for fam in FAMS:
    X, _ = base_obj(fam)
    P, T = R.pos_mundo(X), R.tris_de(X.data)
    area = 0.5 * np.linalg.norm(np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]), axis=1)
    hmin, hmax = CAB.caixa_cabeca(X)
    fam_info[fam] = {"tris": T.ravel().tolist(), "areas": [round(float(x), 9) for x in area], "nv": len(P),
                     "cabeca": [hmin.tolist(), hmax.tolist()]}
open(os.path.join(SAIDA, "familias.txt"), "w").write(
    base64.b64encode(gzip.compress(json.dumps(fam_info).encode(), 9)).decode())

itens = [("roupa", x) for x in R.CATALOGO["itens"]] + [("cabelo", x) for x in CAB.CATALOGO["itens"]]
if IDS != "todos":
    quer = set(IDS.split(","))
    itens = [(k, x) for k, x in itens if x["id"] in quer]
feitos = 0
for kind, item in itens:
    cab = {"id": item["id"], "familias": {}}
    partes = []
    try:
        if kind == "roupa" and R._resolve(item).get("gerar", {}).get("tipo") == "objeto":
            # objeto de mão: a mesma geometria em todos os corpos, no referencial da mão (veja geradores.objeto)
            import geradores as GER
            ob = GER.objeto(R._resolve(item)["gerar"])
            vert_de, uvs, idx, grupos = geometria(ob)
            P = np.array([v.co[:] for v in ob.data.vertices], np.float32)
            partes += [("loc", P[vert_de]), ("uv", np.round(uvs * 65535).astype(np.uint16)), ("idx", idx)]
            cab.update({"tipo": "mao", "mao": item["mao"], "uv": True, "nv": len(vert_de), "ni": len(idx), "grupos": grupos,
                        "familias": {f: True for f in FAMS}})
            R.garante_mascara(ob, item["id"])
            bpy.data.objects.remove(ob, do_unlink=True)
            grava(os.path.join(SAIDA, "itens", item["id"] + ".txt"), cab, partes)
            feitos += 1
            print("item", item["id"], "mao", len(vert_de), flush=True)
            continue
        for fam in FAMS:
            X, arm = base_obj(fam)
            for pb in arm.pose.bones:
                pb.matrix_basis.identity()
            bpy.context.view_layer.update()
            if kind == "cabelo":
                ob = CAB.encaixa(item, arm, X, PACOTES)
                tipo = "cabeca"
            else:
                ob = R.veste(item, arm, X, PACOTES)
                tipo = "cabeca" if R._resolve(item).get("tipo") in ("cabeca", "rosto") else "pele"
            for m in list(ob.modifiers):
                ob.modifiers.remove(m)
            Pg = R.pos_mundo(ob)
            vert_de, uvs, idx, grupos = geometria(ob)
            if tipo == "pele":
                tri, bar, off = liga_pele(Pg, X)
                # quantizado: baricêntricas em 1/65535, deslocamento em 0,05 mm
                partes += [(f"{fam}_tri", tri[vert_de]),
                           (f"{fam}_bar", np.round(np.clip(bar[vert_de], 0, 1) * 65535).astype(np.uint16)),
                           (f"{fam}_off", np.round(np.clip(off[vert_de] / 0.00005, -32767, 32767)).astype(np.int16))]
            else:
                hmin, hmax = (np.array(v) for v in fam_info[fam]["cabeca"])
                nrm = (Pg - hmin) / np.maximum(hmax - hmin, 1e-6)
                partes.append((f"{fam}_pos", nrm[vert_de].astype(np.float32)))
            # a mesma geometria nas três famílias (mesma peça, mesmos cortes): UV, triângulos e grupos uma vez só
            uvq = np.round(uvs * 65535).astype(np.uint16) if uvs.min() >= 0 and uvs.max() <= 1 else uvs
            if "uv" not in cab:
                partes += [("uv", uvq), ("idx", idx)]
                cab.update({"uv": True, "nv": len(vert_de), "ni": len(idx), "grupos": grupos})
                ref = (uvq, idx)
            elif not (len(uvq) == len(ref[0]) and np.array_equal(uvq, ref[0]) and len(idx) == len(ref[1])
                      and np.array_equal(idx, ref[1])):
                # a geometria saiu em outra ordem nesta família: UV, triângulos e grupos próprios
                partes += [(f"{fam}_uv", uvq), (f"{fam}_idx", idx)]
                cab.setdefault("proprios", {})[fam] = {"nv": len(vert_de), "ni": len(idx), "grupos": grupos}
            cab["tipo"] = tipo
            cab["familias"][fam] = True
            if kind == "roupa":
                R.garante_mascara(ob, item["id"])
            bpy.data.objects.remove(ob, do_unlink=True)
    except Exception as e:  # uma peça que não encaixa não derruba as outras
        print("falhou", item["id"], repr(e), flush=True)
        continue
    grava(os.path.join(SAIDA, "itens", item["id"] + ".txt"), cab, partes)
    feitos += 1
    print("item", item["id"], cab["tipo"], cab["nv"], flush=True)
R.salva_mascaras()
print("fim", feitos)
