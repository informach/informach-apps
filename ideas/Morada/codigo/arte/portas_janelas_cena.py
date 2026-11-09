"""Renders da vitrine das portas e janelas (portas_janelas.blend): a folha das janelas, a das portas e acabamentos.
Uso: blender-venv/bin/python -I portas_janelas_cena.py -- <pasta da construcao> <saida>"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

V = Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import construcao_cena as CC  # noqa: E402


def coloca(ob, x, y, giro=0.0, z=0.0):
    ob.hide_render = False
    pts = [V(c) for c in ob.bound_box]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    zmin = min(p.z for p in pts)
    ob.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(giro), 4, "Z") @ Matrix.Translation((-cx, 0, -zmin))


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    pasta, saida = a[0], a[1]
    os.makedirs(saida, exist_ok=True)
    cat = json.load(open(os.path.join(pasta, "portas_janelas.json")))
    # janelas: 3 linhas (larga, arco, quadrada) × 4 desenhos × 3 cores; óculos no fim
    bpy.ops.wm.open_mainfile(filepath=os.path.join(pasta, "portas_janelas.blend"))
    for o in bpy.data.objects:
        o.hide_render = True
    obs = {o.name: o for o in bpy.data.objects}
    linhas = [["larga_inteira", "larga_grade_6x2", "larga_grade_3x2", "larga_bandeira"],
              ["arco_folhas", "arco_inteira", "arco_2x3", "arco_2x5"],
              ["quadrada_inteira", "quadrada_bandeira", "quadrada_cruz", "quadrada_folhas"]]
    for li, desenhos in enumerate(linhas):
        for ci, cor in enumerate(("branca", "preta", "madeira")):
            for di, d in enumerate(desenhos):
                coloca(obs[f"janela_{d}_{cor}"], (ci * 4 + di) * 2.05, li * 2.6, -12)
    coloca(obs["janela_oculo_branca"], 4 * 2.05 + 1.0, 3 * 2.6, -12)
    coloca(obs["janela_oculo_preta"], 6 * 2.05 + 1.0, 3 * 2.6, -12)
    CC.luzes_camera(V((11.3, 3.9, 0.6)), 27, lente=40, elev=0.42, azim=-12, res=(2000, 1125))
    bpy.context.scene.render.filepath = os.path.join(saida, "janelas.png")
    bpy.ops.render.render(write_still=True)
    # portas: 3 linhas de cor × 10 desenhos; duplas, batentes, lambris e cantoneiras na frente
    bpy.ops.wm.open_mainfile(filepath=os.path.join(pasta, "portas_janelas.blend"))
    for o in bpy.data.objects:
        o.hide_render = True
    obs = {o.name: o for o in bpy.data.objects}
    desenhos = ["vidro_6", "classica_2", "classica_4", "classica_5", "vidro_inteiro", "vidro_10", "ripas", "frisos_vidro", "faixa", "arco"]
    for ci, cor in enumerate(("branca", "preta", "madeira")):
        for di, d in enumerate(desenhos):
            coloca(obs[f"porta_{d}_{cor}"], di * 1.45, ci * 2.2 + 4.6, -14)
        for di, d in enumerate(("vidro_6", "classica_2", "vidro_inteiro")):
            coloca(obs[f"porta_dupla_{d}_{cor}"], 14.8 + di * 2.0, ci * 2.2 + 4.6, -14)
        x = ci * 1.6
        coloca(obs[f"batente_simples_{cor}"], x, 1.9 - ci * 0.5, -14)
        coloca(obs[f"batente_duplo_{cor}"], 5.0 + ci * 2.1, 1.9 - ci * 0.5, -14)
        coloca(obs[f"batente_arco_{cor}"], 12.0 + ci * 1.7, 1.9 - ci * 0.5, -14)
        coloca(obs[f"lambri_1m_{cor}"], 17.6, 1.4 - ci * 0.9, -14)
        coloca(obs[f"lambri_0_5m_{cor}"], 19.2, 1.4 - ci * 0.9, -14)
        coloca(obs[f"canto_lambri_{cor}"], 20.3, 1.4 - ci * 0.9, -14)
    CC.luzes_camera(V((10.3, 4.6, 0.6)), 33, lente=40, elev=0.55, azim=-10, res=(2000, 1125))
    bpy.context.scene.render.filepath = os.path.join(saida, "portas.png")
    bpy.ops.render.render(write_still=True)
    # close para conferir o acabamento
    if os.environ.get("CLOSE"):
        bpy.ops.wm.open_mainfile(filepath=os.path.join(pasta, "portas_janelas.blend"))
        for o in bpy.data.objects:
            o.hide_render = True
        obs = {o.name: o for o in bpy.data.objects}
        for i, n in enumerate(["porta_vidro_6_branca", "porta_classica_4_madeira", "porta_frisos_vidro_preta", "porta_faixa_branca"]):
            coloca(obs[n], i * 1.2, 0, -25)
        for i, n in enumerate(["janela_arco_2x3_branca", "janela_quadrada_cruz_preta", "janela_larga_bandeira_madeira"]):
            coloca(obs[n], 5.2 + [0, 1.2, 2.9][i], 0, -25)
        CC.luzes_camera(V((4.3, 0, 1.1)), 9.5, lente=45, elev=0.18, azim=-20, res=(1800, 900))
        bpy.context.scene.render.filepath = os.path.join(saida, "close_pj.png")
        bpy.ops.render.render(write_still=True)
    print("fim")


if __name__ == "__main__":
    main()
