"""Monta cômodos com as peças da biblioteca de construção (construcao.blend) e renderiza: a folha das peças e dois
cômodos de exemplo, com a vitrine de cômodos modulares como norte.

Uma planta é uma lista de trechos de parede: (ponto inicial, direção "L"/"N"/"O"/"S", peças em sequência, textura de
dentro, textura de fora). Percorrendo o contorno de um cômodo no sentido anti-horário (visto de cima), o lado de dentro
fica à esquerda: é a face_a. Nos cantos entra um pilar. Encaixes (portas e janelas dos pacotes) vão nos vãos das peças
que os pedem.

Uso: blender-venv/bin/python -I construcao_cena.py -- <pasta da construcao> <saida> [pecas|comodos|todos]
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

V = Vector
DIR = {"L": 0.0, "N": 90.0, "O": 180.0, "S": 270.0}


def mat_textura(pasta, tex, rug=0.75):
    """Material com uma textura da biblioteca (ou uma cor "#rrggbb")."""
    nome = "m_" + tex
    m = bpy.data.materials.get(nome)
    if m:
        return m
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rug
    if tex.startswith("#"):
        h = tex.lstrip("#")
        b.inputs["Base Color"].default_value = (*[(int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)], 1)
    else:
        tx = m.node_tree.nodes.new("ShaderNodeTexImage")
        tx.image = bpy.data.images.load(os.path.join(pasta, "texturas", tex + ".png"), check_existing=True)
        tx.interpolation = "Cubic"
        m.node_tree.links.new(tx.outputs["Color"], b.inputs["Base Color"])
    return m


def instancia(fonte, nome, pos, giro_graus, mats=None):
    ob = fonte.copy()
    ob.data = fonte.data.copy()
    ob.name = nome
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = Matrix.Translation(pos) @ Matrix.Rotation(math.radians(giro_graus), 4, "Z")
    if mats:
        for i, m in enumerate(mats):
            if m is not None and i < len(ob.data.materials):
                ob.data.materials[i] = m
    return ob


def monta(pasta, planta):
    cat = json.load(open(os.path.join(pasta, "construcao.json")))
    comp = {p["id"]: p["comp"] for p in cat["paredes"]}
    vaos_de = {p["id"]: p.get("vaos", []) for p in cat["paredes"]}
    enc_por_peca = {}
    for e in cat["encaixes"]:
        enc_por_peca.setdefault(e["vao"]["peca"], []).append(e["id"])
    # portas e janelas da biblioteca (portas_janelas.blend): trazidas para a cena na primeira vez
    pj_cat = {}
    f_pj = os.path.join(pasta, "portas_janelas.json")
    if os.path.exists(f_pj):
        pj = json.load(open(f_pj))
        pj_cat = {x["id"]: x for g in ("janelas", "portas", "batentes") for x in pj[g]}
        pedidos = set()
        for t_ in planta.get("paredes", []):
            for q in t_[2]:
                if isinstance(q, tuple) and q[1] in pj_cat:
                    pedidos.add(q[1])
                    if pj_cat[q[1]].get("batente"):
                        pedidos.add(pj_cat[q[1]]["batente"])
        faltam = [n for n in pedidos if n not in bpy.data.objects]
        if faltam:
            with bpy.data.libraries.load(os.path.join(pasta, "portas_janelas.blend"), link=False) as (de, para):
                para.objects = [n for n in de.objects if n in faltam]
            for o in para.objects:
                o.hide_render = True
    fontes = {o.name: o for o in bpy.data.objects}
    borda = bpy.data.materials["borda"]
    esp = cat["espessura"]
    cantos = {}
    ends = {}
    alt_de = {p["id"]: p["alt"] for p in cat["paredes"]}
    lambri_ok = {l["comp"]: l["id"] for l in cat.get("lambris", [])}
    for k, (x, y), d, pecas, dentro, fora, *extra in [(i,) + tuple(t) for i, t in enumerate(planta.get("paredes", []))]:
        com_lambri = bool(extra and extra[0])
        ang = DIR[d]
        dv = V((math.cos(math.radians(ang)), math.sin(math.radians(ang)), 0))
        p = V((x, y, 0))
        ch = (round(x, 3), round(y, 3))
        cantos[ch] = max(cantos.get(ch, 0), alt_de[pecas[0][0] if isinstance(pecas[0], tuple) else pecas[0]])
        ma, mb = mat_textura(pasta, dentro), mat_textura(pasta, fora)
        for j, pid in enumerate(pecas):
            encaixe = None
            if isinstance(pid, tuple):
                pid, encaixe = pid
            instancia(fontes[pid], f"{pid}_{k}_{j}", p.copy(), ang, [ma, mb, borda])
            vaos_chao = [v for v in vaos_de[pid] if v["peitoril"] < 0.01]
            if com_lambri and comp[pid] in lambri_ok and not vaos_chao:  # lambri na face de dentro, sem portas
                lado = V((-dv.y, dv.x, 0))  # a face_a (dentro) fica à esquerda de quem percorre
                instancia(fontes[lambri_ok[comp[pid]]], f"lambri_{k}_{j}", p + lado * (esp / 2 + 0.001), ang)
            elif com_lambri and vaos_chao:  # com porta: lambri de 0,5 m nos lados do vão, onde couber
                lado = V((-dv.y, dv.x, 0))
                for v in vaos_chao:
                    for x0_, x1_ in ((0.0, v["cx"] - v["larg"] / 2), (v["cx"] + v["larg"] / 2, comp[pid])):
                        xx_ = x0_
                        while x1_ - xx_ >= 0.5 - 1e-6:
                            instancia(fontes[lambri_ok[0.5]], f"lambri_{k}_{j}_{xx_}", p + dv * xx_ + lado * (esp / 2 + 0.001), ang)
                            xx_ += 0.5
            if encaixe and encaixe in pj_cat:  # da biblioteca: a origem é o meio do vão
                cx = vaos_de[pid][0]["cx"]
                instancia(fontes[encaixe], f"{encaixe}_{k}_{j}", p + dv * cx, ang).hide_render = False
                if pj_cat[encaixe].get("batente"):
                    instancia(fontes[pj_cat[encaixe]["batente"]], f"bat_{k}_{j}", p + dv * cx, ang).hide_render = False
            elif encaixe:
                instancia(fontes[encaixe], f"{encaixe}_{k}_{j}", p.copy(), ang)
            p += dv * comp[pid]
        ch = (round(p.x, 3), round(p.y, 3))
        cantos[ch] = max(cantos.get(ch, 0), alt_de[pid])
    # cantoneira só em canto (mudança de direção) e em ponta solta: num ponto em que a parede segue reta (duas peças
    # na mesma linha, com ou sem uma divisória chegando), ela apareceria como uma faixa branca no meio da parede
    retas = set()
    for k, (x, y), d, pecas, *_ in [(i,) + tuple(t) for i, t in enumerate(planta.get("paredes", []))]:
        ang = math.radians(DIR[d])
        dv = V((math.cos(ang), math.sin(ang), 0))
        L = sum(comp[q[0] if isinstance(q, tuple) else q] for q in pecas)
        ini, fim = (round(x, 3), round(y, 3)), (round(x + dv.x * L, 3), round(y + dv.y * L, 3))
        ends.setdefault(ini, []).append(d)
        ends.setdefault(fim, []).append({"L": "O", "O": "L", "N": "S", "S": "N"}[d])
        # pontos de dentro do trecho (emendas entre peças e encontros com divisórias) são retos
        for s in range(1, int(round(L / 0.5))):
            retas.add((round(x + dv.x * s * 0.5, 3), round(y + dv.y * s * 0.5, 3)))
    for pt, ds in ends.items():
        if ("L" in ds and "O" in ds) or ("N" in ds and "S" in ds):
            retas.add(pt)
    for (x, y), h in cantos.items():  # cantoneira em cada canto e ponta solta
        if (x, y) in retas:
            continue
        o = instancia(fontes["pilar"], f"pilar_{x}_{y}", V((x, y, 0)), 0.0, [None, None, borda])
        o.scale.z = (h + 0.004) / (cat["altura"] + 0.004)
    for (x, y, tex) in planta.get("chaos", []):
        instancia(fontes["chao_4m"], f"chao_{x}_{y}", V((x, y, 0)), 0.0, [mat_textura(pasta, tex, 0.6), borda])


# plantas de exemplo (8 × 8 m: quatro placas de chão)
COMODO_A = {  # azul por fora; sala em L roxa e quarto amarelo, com lambri; chão xadrez verde; tudo branco
    "chaos": [(0, 0, "xadrez_verde"), (4, 0, "xadrez_verde"), (0, 4, "xadrez_verde"), (4, 4, "xadrez_verde")],
    "paredes": [
        ((0, 0), "L", [("janela_2m", "janela_quadrada_cruz_branca"), "parede_1m", ("porta_1m", "porta_vidro_6_branca"), "parede_2m",
                       ("janela_2m", "janela_quadrada_cruz_branca")], "degrade_roxo", "degrade_azul", True),
        ((8, 0), "N", ["parede_2m", ("janela_arco_2m", "janela_arco_2x3_branca"), "parede_2m", "parede_2m"], "degrade_roxo", "degrade_azul", True),
        ((8, 8), "O", ["parede_2m", "parede_2m"], "degrade_roxo", "degrade_azul", True),
        ((4, 8), "O", [("janela_2m", "janela_quadrada_folhas_branca"), "parede_2m"], "degrade_mostarda", "degrade_azul", True),
        ((0, 8), "S", ["parede_2m", "parede_1m"], "degrade_mostarda", "degrade_azul", True),
        ((0, 5), "S", ["parede_2m", ("janela_quadrada_1m", "janela_redonda_natal"), "parede_2m"], "degrade_roxo", "degrade_azul", True),
        ((0, 5), "L", ["parede_2m", ("porta_lateral_2m", "porta_classica_2_branca")], "degrade_mostarda", "degrade_roxo", True),
        ((4, 5), "N", ["parede_2m", "parede_1m"], "degrade_mostarda", "degrade_roxo", True),
    ],
}
COMODO_B = {  # tijolo por fora; listras verdes e quarto de nuvens, com lambri; madeira; portas e janelas de madeira
    "chaos": [(0, 0, "madeira_mel"), (4, 0, "madeira_mel"), (0, 4, "madeira_mel"), (4, 4, "madeira_mel")],
    "paredes": [
        ((0, 0), "L", ["parede_1m", ("janela_quadrada_1m", "janela_oculo_branca"), ("arco_2m", "porta_arco_madeira"), "parede_1m",
                       ("janela_larga_2m", "janela_larga_bandeira_branca"), "parede_1m"], "listra_verde", "tijolo_terracota", True),
        ((8, 0), "N", ["parede_2m", ("janela_2m", "janela_quadrada_cruz_branca"), "parede_2m", "parede_2m"], "listra_verde", "tijolo_terracota", True),
        ((8, 8), "O", ["parede_2m", "parede_2m"], "listra_verde", "tijolo_terracota", True),
        ((4, 8), "O", [("janela_arco_2m", "janela_arco_folhas_branca"), "parede_2m"], "papel_nuvens", "tijolo_terracota", True),
        ((0, 8), "S", ["parede_2m", "parede_2m"], "papel_nuvens", "tijolo_terracota", True),
        ((0, 4), "S", [("janela_2m", "janela_quadrada_bandeira_branca"), "parede_2m"], "listra_verde", "tijolo_terracota", True),
        ((0, 4), "L", ["parede_2m", ("porta_2m", "porta_classica_4_madeira")], "papel_nuvens", "listra_verde", True),
        ((4, 4), "N", ["parede_2m", "parede_2m"], "papel_nuvens", "listra_verde", True),
    ],
}


def luzes_camera(alvo, dist, lente=50, elev=0.95, azim=-35, res=(1600, 1000)):
    scn = bpy.context.scene
    for o in [o for o in scn.objects if o.type in ("LIGHT", "CAMERA")]:
        bpy.data.objects.remove(o, do_unlink=True)
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 64))
    scn.cycles.use_denoising = True
    scn.cycles.device = "CPU"
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("fundo")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.06, 0.12, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.2
    bpy.ops.object.light_add(type="SUN")
    sol = bpy.context.active_object
    sol.data.energy = 3.2
    sol.data.angle = math.radians(8)
    sol.rotation_euler = (math.radians(42), 0, math.radians(azim + 160))
    bpy.ops.object.light_add(type="AREA", location=(alvo.x - 6, alvo.y - 10, 12))
    a = bpy.context.active_object
    a.data.energy = 2500
    a.data.size = 12
    a.rotation_euler = (alvo - a.location).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("c")
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cd.lens = lente
    d = V((math.sin(math.radians(azim)), -math.cos(math.radians(azim)), elev)).normalized()
    cam.location = alvo + d * dist
    cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
    # chão escuro azulado (a vitrine)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(alvo.x, alvo.y, -0.045))
    pl = bpy.context.active_object
    m = bpy.data.materials.new("fundo_chao")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.035, 0.07, 0.14, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    pl.data.materials.append(m)


def esconde_fontes():
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = True


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    pasta, saida = a[0], a[1]
    o_que = a[2] if len(a) > 2 else "todos"
    os.makedirs(saida, exist_ok=True)
    if o_que in ("comodos", "todos"):
        bpy.ops.wm.open_mainfile(filepath=os.path.join(pasta, "construcao.blend"))
        esconde_fontes()
        antes = set(bpy.data.objects)
        monta(pasta, COMODO_A)
        a_obs = [o for o in bpy.data.objects if o not in antes]
        antes = set(bpy.data.objects)
        monta(pasta, COMODO_B)
        for o in bpy.data.objects:
            if o not in antes:
                continue
        for o in [o for o in bpy.data.objects if o not in antes]:
            o.location.x += 11.0
        for o in a_obs + [o for o in bpy.data.objects if o not in antes]:
            o.hide_render = False
        luzes_camera(V((9.5, 3.6, 0.0)), 33, lente=45, elev=1.0, azim=-24)
        bpy.context.scene.render.filepath = os.path.join(saida, "comodos.png")
        bpy.ops.render.render(write_still=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(saida, "comodos.blend"), compress=True)
    if o_que in ("pecas", "todos"):
        bpy.ops.wm.open_mainfile(filepath=os.path.join(pasta, "construcao.blend"))
        esconde_fontes()
        cat = json.load(open(os.path.join(pasta, "construcao.json")))
        azul = mat_textura(pasta, "degrade_azul")
        borda = bpy.data.materials["borda"]
        fontes = {o.name: o for o in bpy.data.objects}
        x, y = 0.0, 0.0
        linha_max = 13.0
        for p in cat["paredes"]:
            if x + p["comp"] > linha_max:
                x, y = 0.0, y + 4.5
            instancia(fontes[p["id"]], "v_" + p["id"], V((x, y, 0)), 0.0, [azul, azul, borda]).hide_render = False
            x += p["comp"] + 0.6
        luzes_camera(V((6.5, 6.5, 1.0)), 30, lente=50, elev=0.85, azim=-18, res=(1800, 1100))
        bpy.context.scene.render.filepath = os.path.join(saida, "pecas.png")
        bpy.ops.render.render(write_still=True)
    print("fim")


if __name__ == "__main__":
    main()
