"""Testes de encaixe das ruas e pontes diagonais: monta as peças encostadas, MEDE as emendas e renderiza (de cima e
em três quartos).

  blender-venv/bin/python -I morada-art/ruas_diagonais_encaixe.py -- SP/cidade_out <teste> <prefixo_saida> [noite]
      [sem_render] [amostras=N]

Testes: a (rua da grade → curva → 3 diagonais → curva de volta à grade), a2 (avenida, curva à esquerda, diagonal
noroeste e volta), b (costa → cabeceira → 4 módulos de ponte → cabeceira → rua), c (ponte estaiada no lugar dos
módulos). Grava <prefixo>_medidas.json com as emendas medidas.

Medidas:
- chão: em cada borda comum entre duas peças de chão (pelo menos uma desta categoria), a cada 5 cm, um raio de cima
  em cada lado (5 mm da borda), só contra a peça daquele lado: degrau = |z_a − z_b|, fresta = um lado sem superfície;
- sobreposição: o quanto cada peça de chão passa do retângulo das suas quadras (o que fica abaixo de z = 0,5);
- tabuleiros: no corte perpendicular de cada emenda (pelos cantos), a cada 5 cm na largura, raio de cima em cada
  lado; e o quanto cada peça passa do plano do corte (sobreposição);
- faixas de rolamento: distância entre o fim de uma faixa e o começo da faixa seguinte (outra peça).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector as V, Matrix  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import moveis_base as mb  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1:]
SAIDA, TESTE, PREF = a[0], a[1], a[2]
OP = set(x for x in a[3:] if "=" not in x)
KV = dict(x.split("=") for x in a[3:] if "=" in x)
Q = 15.0
MINHA = "ruas_diagonais"
CATS = {}


def cat(c):
    if c not in CATS:
        CATS[c] = {i["id"]: i for i in json.load(open(os.path.join(SAIDA, c, "catalogo.json")))["itens"]}
    return CATS[c]


# ------------------------------------------------------------------------------------------------- montagens
def P(c, i, cx, cy, r=0, z=0.0):
    return dict(c=c, i=i, x=cx, y=cy, z=z, r=r)


def q(i, j):
    return (Q * i, Q * j)


def chao_fundo(pecas, i0, i1, j0, j1, escolhe):
    """Completa as quadras livres (de nenhuma peça de chão) com a peça de fundo escolhe(i, j)."""
    ocup = set()
    for p in pecas:
        it = cat(p["c"])[p["i"]]
        if p.get("elevado"):
            continue
        nx, ny = it.get("quadras", [1, 1])
        if p["r"] % 180:
            nx, ny = ny, nx
        for di in range(nx):
            for dj in range(ny):
                ci = round((p["x"] - Q * (nx - 1) / 2) / Q) + di
                cj = round((p["y"] - Q * (ny - 1) / 2) / Q) + dj
                ocup.add((ci, cj))
    out = []
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            if (i, j) not in ocup:
                c_, id_, r_ = escolhe(i, j)
                out.append(P(c_, id_, *q(i, j), r_))
    return out


def diagonal_ne(pecas, cantos, rua="rua_diagonal", ench="rua_diagonal_enchimento", principais=()):
    """Principais nas quadras dadas e enchimentos nos cantos dados (canto = quadra (i, j) cujo canto nordeste é o
    canto da emenda): enchimento giro 0 em (i + 1, j) e giro 180 em (i, j + 1)."""
    for (i, j) in principais:
        pecas.append(P(MINHA, rua, *q(i, j), 0))
    for (i, j) in cantos:
        pecas.append(P(MINHA, ench, *q(i + 1, j), 0))
        pecas.append(P(MINHA, ench, *q(i, j + 1), 180))


def teste_a():
    pc = [P("ruas", "rua_reta", *q(0, -2)), P("ruas", "rua_reta", *q(0, -1)),
          P(MINHA, "rua_diagonal_curva_direita", 7.5, 7.5, 0)]
    diagonal_ne(pc, cantos=[(1, 1), (2, 2), (3, 3), (4, 4)], principais=[(2, 2), (3, 3), (4, 4)])
    pc += [P(MINHA, "rua_diagonal_curva_direita", 82.5, 82.5, 180), P("ruas", "rua_reta", *q(6, 7)),
           P("ruas", "rua_reta", *q(6, 8))]
    pc += chao_fundo(pc, -1, 7, -2, 8, lambda i, j: ("pisos", "piso_calcada_lisa", 0))
    juntas = []
    return pc, juntas


def teste_a2():
    """Avenida: chega do sul, curva à esquerda para a diagonal noroeste (peças giradas 90°) e volta para o norte com a
    curva à esquerda girada 180°. Sobras em grama."""
    pc = [P("ruas", "avenida_reta", *q(0, -2)), P("ruas", "avenida_reta", *q(0, -1)),
          P(MINHA, "avenida_diagonal_curva_esquerda", -7.5, 7.5, 0)]
    # diagonal noroeste: principal giro 90 em (i, j); enchimento giro 90 em (i, j + 1) e giro 270 em (i − 1, j)
    princ = [(-2, 2), (-3, 3), (-4, 4)]
    for (i, j) in princ:
        pc.append(P(MINHA, "avenida_diagonal_grama", *q(i, j), 90))
    # cantos da emenda (canto noroeste da quadra (i, j)): (−1, 1), (−2, 2), (−3, 3), (−4, 4)
    for (i, j) in [(-1, 1), (-2, 2), (-3, 3), (-4, 4)]:
        pc.append(P(MINHA, "avenida_diagonal_enchimento_grama", *q(i, j + 1), 90))
        pc.append(P(MINHA, "avenida_diagonal_enchimento_grama", *q(i - 1, j), 270))
    pc += [P(MINHA, "avenida_diagonal_curva_esquerda", -82.5, 82.5, 180), P("ruas", "avenida_reta", *q(-6, 7)),
           P("ruas", "avenida_reta", *q(-6, 8))]
    pc += chao_fundo(pc, -7, 1, -2, 8, lambda i, j: ("pisos", "piso_grama", 0))
    return pc, []


def teste_d():
    """Bifurcação: a rua reta segue para o norte e o ramal vira diagonal (2 quadras) até a borda da montagem."""
    pc = [P("ruas", "rua_reta", *q(0, -2)), P("ruas", "rua_reta", *q(0, -1)),
          P(MINHA, "rua_diagonal_bifurcacao_direita", 7.5, 7.5, 0),
          P("ruas", "rua_reta", *q(0, 2)), P("ruas", "rua_reta", *q(0, 3))]
    diagonal_ne(pc, cantos=[(1, 1), (2, 2)], principais=[(2, 2), (3, 3)])
    pc += chao_fundo(pc, -1, 3, -2, 3, lambda i, j: ("pisos", "piso_calcada_lisa", 0))
    return pc, []


def fundo_ilha(i, j):
    if j <= 2:
        return ("pisos", "piso_grama", 0)
    if j == 3:
        return ("cenario", "costa_areia_reta", 0)
    if j in (4, 5):
        return ("cenario", "mar", 0)
    if j == 6:
        return ("cenario", "costa_areia_reta", 180)
    return ("pisos", "piso_grama", 0)


def teste_b(efeito=None):
    """Cabeceira 4 × 4 em terra (quadras −1..2), costa na fileira 3, mar em 4 e 5, costa na 6 e a outra cabeceira
    (giro 180) nas quadras 7..10."""
    pc = []
    diagonal_ne(pc, cantos=[(-4, -4), (-3, -3), (-2, -2)], principais=[(-4, -4), (-3, -3), (-2, -2)],
                rua="rua_diagonal_grama", ench="rua_diagonal_enchimento_grama")
    pc.append(P(MINHA, "ponte_diagonal_cabeceira_rua", 7.5, 7.5, 0))
    if efeito:
        pc.append(dict(P(MINHA, efeito, 67.5, 67.5, 0), elevado=True))
    else:
        for (k, idp) in ((3, "ponte_diagonal_vao_rua"), (4, "ponte_diagonal_tabuleiro_rua"),
                         (5, "ponte_diagonal_vao_rua"), (6, "ponte_diagonal_tabuleiro_rua")):
            pc.append(dict(P(MINHA, idp, *q(k, k), 0), elevado=True))
    pc.append(P(MINHA, "ponte_diagonal_cabeceira_rua", 127.5, 127.5, 180))
    diagonal_ne(pc, cantos=[(10, 10), (11, 11)], principais=[(11, 11), (12, 12)],
                rua="rua_diagonal_grama", ench="rua_diagonal_enchimento_grama")
    pc += chao_fundo(pc, -4, 12, -4, 12, fundo_ilha)
    return pc, [(37.5, 37.5), (52.5, 52.5), (67.5, 67.5), (82.5, 82.5), (97.5, 97.5)] if not efeito else \
        [(37.5, 37.5), (97.5, 97.5)]


TESTES = {"a": teste_a, "a2": teste_a2, "b": teste_b, "c": lambda: teste_b("ponte_diagonal_estaiada"),
          "c2": lambda: teste_b("ponte_diagonal_arco"), "d": teste_d}


# ------------------------------------------------------------------------------------------------- montagem
def importa(p):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SAIDA, p["c"], "glb", p["i"] + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (p["x"], p["y"], p["z"])
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (0, 0, math.radians(p["r"]))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
            o.hide_set(True)
    p["objs"] = [o for o in novos if o.type == "MESH" and not o.get("colisao")]
    return novos


def bvh_de(objs):
    vs, fs = [], []
    for o in objs:
        M = o.matrix_world
        base = len(vs)
        vs += [M @ v.co for v in o.data.vertices]
        fs += [[base + i for i in pol.vertices] for pol in o.data.polygons]
    return BVHTree.FromPolygons(vs, fs, all_triangles=False), vs


def retangulo(p):
    it = cat(p["c"])[p["i"]]
    nx, ny = it.get("quadras", [1, 1])
    if p["r"] % 180:
        nx, ny = ny, nx
    return (p["x"] - Q * nx / 2, p["y"] - Q * ny / 2, p["x"] + Q * nx / 2, p["y"] + Q * ny / 2)


def mede(pecas, juntas):
    bpy.context.view_layer.update()
    for p in pecas:
        p["bvh"], p["vs"] = bvh_de(p["objs"])
    rel = {"teste": TESTE, "chao": {}, "sobreposicao_chao": {}, "tabuleiros": [], "faixas": {}}
    chao = [p for p in pecas if not p.get("elevado")]
    for p in chao:
        p["ret"] = retangulo(p)
    # bordas comuns
    n_am, n_deg, n_fres, dmax, n_tinta, dmax_real = 0, 0, 0, 0.0, 0, 0.0
    pares = []
    piores = []
    ctrl = []
    c_am, c_tinta = 0, 0
    for ia_, A in enumerate(chao):
        for B in chao[ia_ + 1:]:
            controle = A["c"] == "pisos" and B["c"] == "pisos" and A["i"] == B["i"] and \
                abs(A["ret"][1] - B["ret"][1]) < 1e-6 and abs(abs(A["ret"][0] - B["ret"][0]) - Q) < 1e-6
            if A["c"] != MINHA and B["c"] != MINHA and not (controle and len(ctrl) < 6):
                continue
            if controle:
                ctrl.append(1)
            ax0, ay0, ax1, ay1 = A["ret"]
            bx0, by0, bx1, by1 = B["ret"]
            seg = None
            if abs(ax1 - bx0) < 1e-6 or abs(bx1 - ax0) < 1e-6:
                x = ax1 if abs(ax1 - bx0) < 1e-6 else ax0
                y0, y1 = max(ay0, by0), min(ay1, by1)
                if y1 - y0 > 1e-3:
                    seg = ((x, y0), (x, y1), V((1 if x == ax1 else -1, 0, 0)))
            elif abs(ay1 - by0) < 1e-6 or abs(by1 - ay0) < 1e-6:
                y = ay1 if abs(ay1 - by0) < 1e-6 else ay0
                x0, x1 = max(ax0, bx0), min(ax1, bx1)
                if x1 - x0 > 1e-3:
                    seg = ((x0, y), (x1, y), V((0, 1 if y == ay1 else -1, 0)))
            if not seg:
                continue
            (p0, p1, nrm) = seg   # nrm aponta de A para B
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            n = int(L / 0.05)
            dmax_par = 0.0
            for k in range(n + 1):
                t = (k + 0.5) / (n + 1)
                px, py = p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t
                tx, ty = -nrm.y, nrm.x   # ao longo da borda
                res = []
                for dd in (0.0, 0.003, -0.003, 0.006, -0.006):
                    qx, qy = px + tx * dd, py + ty * dd
                    za = raio(A, qx - nrm.x * 1e-4, qy - nrm.y * 1e-4, 0.5)
                    zb = raio(B, qx + nrm.x * 1e-4, qy + nrm.y * 1e-4, 0.5)
                    res.append((za, zb))
                za, zb = res[0]
                if controle:
                    if za is not None and zb is not None and 0.001 < abs(za - zb) <= 0.005:
                        c_tinta += 1
                    c_am += 1
                    continue
                n_am += 1
                if all((x is None) != (y is None) for x, y in res):
                    n_fres += 1
                    piores.append(("fresta", A["i"], B["i"], round(px, 2), round(py, 2)))
                    continue
                if za is None or zb is None:
                    continue
                d = min(abs(x - y) for x, y in res if x is not None and y is not None)
                dmax_par = max(dmax_par, d)
                if 0.001 < d <= 0.005:
                    n_tinta += 1
                    if n_tinta <= 12:
                        piores.append(("tinta", A["i"], B["i"], round(px, 2), round(py, 2), round(za, 4), round(zb, 4)))
                if d > 0.005:
                    dmax_real = max(dmax_real, d)
                    n_deg += 1
                    if len(piores) < 30:
                        piores.append(("degrau", A["i"], B["i"], round(px, 2), round(py, 2), round(za, 4),
                                       round(zb, 4)))
            dmax = max(dmax, dmax_par)
            pares.append((A["i"], B["i"], round(dmax_par * 1000, 2)))
    rel["chao"] = {"bordas_medidas": len(pares), "amostras": n_am, "diferenca_max_mm": round(dmax * 1000, 2),
                   "degraus_>5mm": n_deg, "degrau_max_mm": round(dmax_real * 1000, 2),
                   "so_pintura_ou_junta_1_a_5mm": n_tinta, "frestas": n_fres,
                   "controle_piso_piso": {"amostras": c_am, "so_pintura_ou_junta_1_a_5mm": c_tinta},
                   "exemplos": piores[:20],
                   "pares": pares}
    # sobreposição: geometria baixa (z < 0,5) fora do retângulo das quadras
    smax = {}
    for p in chao:
        if p["c"] != MINHA:
            continue
        x0, y0, x1, y1 = p["ret"]
        fora = 0.0
        for v in p["vs"]:
            if v.z < 0.5:
                fora = max(fora, x0 - v.x, v.x - x1, y0 - v.y, v.y - y1)
        smax[p["i"]] = max(smax.get(p["i"], -1e9), fora)
    rel["sobreposicao_chao"] = {k: round(max(0.0, v) * 1000, 2) for k, v in smax.items()}
    # tabuleiros: corte perpendicular em cada junta
    for (cx, cy) in juntas:
        d = V((1, 1, 0)).normalized()
        r = V((1, -1, 0)).normalized()
        c = V((cx, cy, 0))
        antes = [p for p in pecas if alcanca(p, c, d, -1)]
        depois = [p for p in pecas if alcanca(p, c, d, 1)]
        A = min(antes, key=lambda p: (V((p["x"], p["y"], 0)) - c).length, default=None)
        B = min(depois, key=lambda p: (V((p["x"], p["y"], 0)) - c).length, default=None)
        if not A or not B:
            rel["tabuleiros"].append({"junta": [cx, cy], "erro": "peças não achadas"})
            continue
        dm, nf, na = 0.0, 0, 0
        ex = []
        for k in range(-149, 150):
            o = k * 0.05
            res = []
            for dd in (0.0, 0.003, -0.003, 0.006, -0.006):
                pa = c + r * (o + dd) - d * 1e-4
                pb = c + r * (o + dd) + d * 1e-4
                res.append((raio(A, pa.x, pa.y, 25.0, zmin=3.0), raio(B, pb.x, pb.y, 25.0, zmin=3.0)))
            na += 1
            if all((x is None) != (y is None) for x, y in res):
                nf += 1
                continue
            ok = [(x, y) for x, y in res if x is not None and y is not None]
            if ok:
                za, zb = min(ok, key=lambda t: abs(t[0] - t[1]))
                dm = max(dm, abs(za - zb))
                if abs(za - zb) > 0.001 and len(ex) < 8:
                    ex.append((round(o, 2), round(za, 4), round(zb, 4)))
        sa = max(((v - c).dot(d) for v in A["vs"]), default=0)
        sb = min(((v - c).dot(d) for v in B["vs"]), default=0)
        rel["tabuleiros"].append({"junta": [cx, cy], "antes": A["i"], "depois": B["i"], "amostras": na,
                                  "degrau_max_mm": round(dm * 1000, 2), "frestas": nf,
                                  "passa_do_corte_mm": [round(max(0, sa) * 1000, 2), round(max(0, -sb) * 1000, 2)],
                                  "exemplos": ex})
    # faixas de rolamento
    pontas = []
    for p in pecas:
        it = cat(p["c"])[p["i"]]
        if "faixas" not in it:
            continue
        M = Matrix.Translation((p["x"], p["y"], p["z"])) @ Matrix.Rotation(math.radians(p["r"]), 4, "Z")
        for f in it["faixas"]:
            pts = [M @ V(pt) for pt in f["pontos"]]
            pontas.append((p["i"], f["nome"], pts[0], pts[-1], id(p)))
    dist = []
    for i_, nome, ini, fim, pid in pontas:
        cand = [(fim - ini2).length for j_, n2, ini2, fim2, pid2 in pontas if pid2 != pid]
        if cand:
            dist.append(min(cand))
    lig = [x for x in dist if x < 0.5]
    rel["faixas"] = {"pontas": len(pontas), "ligadas": len(lig), "dist_max_mm": round(max(lig, default=0) * 1000, 2),
                     "soltas_(fim_da_montagem)": len(dist) - len(lig)}
    return rel


def alcanca(p, c, d, lado):
    """A peça tem tabuleiro do lado 'lado' do corte em c (perto do eixo)?"""
    if "vs" not in p:
        return False
    if not (p.get("elevado") or "cabeceira" in p["i"]):
        return False
    cc = V((p["x"], p["y"], 0))
    return (cc - c).dot(d) * lado > 0 and abs((cc - c).cross(d).z) < 1.0


def raio(p, x, y, z0, zmin=-5.0):
    hit = p["bvh"].ray_cast(V((x, y, z0)), V((0, 0, -1)))
    if hit[0] is None or hit[0].z < zmin:
        return None
    return hit[0].z


# ------------------------------------------------------------------------------------------------- render
def render(pecas, arq, direcao, noite=False, res=(1800, 1200), alvo=None):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(KV.get("amostras", 32))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.get("w") or bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.45 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    sol = bpy.data.objects.get("sol")
    if not sol:
        ld = bpy.data.lights.new("sol", "SUN")
        ld.angle = math.radians(6)
        sol = bpy.data.objects.new("sol", ld)
        scn.collection.objects.link(sol)
        sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
    sol.data.energy = 0.6 if noite else 3.0
    sol.data.color = (0.6, 0.7, 1.0) if noite else (1, 1, 1)
    objs = [o for p in pecas for o in p["objs"]]
    pts = [o.matrix_world @ V(c) for o in objs for c in o.bound_box]
    lo = V([min(p[i] for p in pts) for i in range(3)])
    hi = V([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    cam = bpy.data.objects.get("cam")
    if not cam:
        cd = bpy.data.cameras.new("cam")
        cd.type = "ORTHO"
        cam = bpy.data.objects.new("cam", cd)
        scn.collection.objects.link(cam)
    scn.camera = cam
    cd = cam.data
    d = V(direcao).normalized()
    cam.location = c + d * 400
    up = "Y"
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", up).to_euler()
    if alvo:
        c2, raio_ = V(alvo[:3]), alvo[3]
        cam.location = c2 + d * 400
        cam.rotation_euler = (c2 - cam.location).to_track_quat("-Z", up).to_euler()
        cd.ortho_scale = raio_ * 2
    else:
        R = cam.rotation_euler.to_matrix().inverted()
        proj = [R @ (p - c) for p in pts]
        ex = max(q_.x for q_ in proj) - min(q_.x for q_ in proj)
        ey = max(q_.y for q_ in proj) - min(q_.y for q_ in proj)
        cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.03
        cam.location += cam.matrix_world.to_3x3() @ V(((max(q_.x for q_ in proj) + min(q_.x for q_ in proj)) / 2,
                                                       (max(q_.y for q_ in proj) + min(q_.y for q_ in proj)) / 2, 0))
    cd.clip_end = 1200
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arq
    bpy.ops.render.render(write_still=True)
    print("render", arq, flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pecas, juntas = TESTES[TESTE]()
    for p in pecas:
        importa(p)
    rel = mede(pecas, juntas)
    json.dump(rel, open(PREF + "_medidas.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in rel.items() if k != "chao"}, ensure_ascii=False), flush=True)
    print(json.dumps(rel["chao"], ensure_ascii=False), flush=True)
    if "sem_render" in OP:
        return
    noite = "noite" in OP
    suf = "_noite" if noite else ""
    res = tuple(int(t) for t in KV.get("res", "1800,1200").split(","))
    if "alvo" in KV:
        alvo = [float(t) for t in KV["alvo"].split(",")]
        render(pecas, PREF + f"_detalhe{suf}.png", [float(t) for t in KV.get("dir", "0.8,-1,0.9").split(",")], noite,
               alvo=alvo, res=res)
        return
    render(pecas, PREF + f"_topo{suf}.png", (0.0, -0.0001, 1.0), noite)
    render(pecas, PREF + f"_3q{suf}.png", (0.9, -1.0, 0.95), noite)


main()
