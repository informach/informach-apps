"""Renders com fundo transparente dos modelos 3D de O Jardim Secreto (24/11/2026), para as animações de conceito da
Aula 2. Mesma luz e câmera dos renders da Ilha (ilha_render.py).

    PYTHONPATH=<bpy> python jardim-render-modelos.py <pasta dos glb> <pasta de saída>

Os GLB do jardim estão em docs/design/jardim-secreto/assets do Sistema Zero (regador-azul, flor-do-jardim e
jardim-acolhedor); o aventureiro é o da Ilha. Todos na mesma medida por pixel do aventureiro parado (600 x 800),
para as figuras irem juntas sem reescalar: o regador em 600 x 600 e a flor em 600 x 800. A flor sai fechada (o
primeiro quadro do clipe de florescer) e aberta (o último).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from ilha_render import caixa, clipe, importar, limpar, luz_e_camera, render  # noqa: E402

# Aventureiro: parado e quatro quadros do passo (a escala vale para todas as figuras).
limpar()
objs = importar("aventureiro")
faixa = clipe(objs, "andando")
lo, hi = caixa(objs)
ESCALA = luz_e_camera(lo, hi, 600, 800)
if faixa:
    a, b = faixa
    for k in range(4):
        render(f"aventureiro-andando-{k + 1}", a + round((b - a) * k / 4))
clipe(objs, "parado")
render("aventureiro-parado", 1)

# O regador, na escala do aventureiro (num quadro de 600 x 600 a mesma medida por pixel é 0,75 dela).
limpar()
objs = importar("regador-azul")
clipe(objs, None)
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 600, escala=ESCALA * 0.75)
render("regador-3d", 1)

# A flor: os clipes que ela tem, fechada no começo do florescer e aberta no fim.
limpar()
objs = importar("flor-do-jardim")
nomes = sorted({t.name for o in objs if o.animation_data for t in o.animation_data.nla_tracks})
print("clipes da flor:", nomes)
nome = next((n for n in nomes if "flor" in n.lower()), nomes[0] if nomes else None)
faixa = clipe(objs, nome)
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 800, escala=ESCALA)
if faixa:
    render("flor-3d-fechada", faixa[0])
    # A caixa da flor aberta é maior: a câmera é medida de novo no último quadro.
    bpy.context.scene.frame_set(faixa[1])
    lo, hi = caixa(objs)
    luz_e_camera(lo, hi, 600, 800, escala=ESCALA)
    render("flor-3d-aberta", faixa[1])
else:
    render("flor-3d-aberta", 1)
