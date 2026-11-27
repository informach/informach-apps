"""Renders com fundo transparente dos modelos 3D de Moedas no caminho (27/11/2026), para as animações de conceito da
Aula 2. Mesma luz e câmera dos renders da Ilha e do Jardim (ilha_render.py).

    <blender-venv>/python moedas-render-modelos.py <pasta dos glb> <pasta de saída>

Os GLB são os da biblioteca de modelos dos cursos: aventureiro (o da Ilha), moeda-de-ouro e bau-do-tesouro (os dois
em docs/design/moedas-no-caminho/assets do Sistema Zero). Todos na mesma medida por pixel do aventureiro parado
(600 x 800), para as figuras irem juntas sem reescalar: a moeda em 600 x 600 e o baú em 800 x 800. O baú sai em
quatro quadros do clipe abrir, todos com a câmera do baú aberto (a tampa aberta é a parte mais alta): trocar um pelo
outro na cena não faz o baú pular.
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

# A moeda, na escala do aventureiro (num quadro de 600 x 600 a mesma medida por pixel é 0,75 dela).
limpar()
objs = importar("moeda-de-ouro")
clipe(objs, None)
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 600, escala=ESCALA * 0.75)
render("moeda-3d", 1)

# O baú: fechado (o repouso), abrindo e aberto, com a câmera do último quadro do clipe abrir.
limpar()
objs = importar("bau-do-tesouro")
nomes = sorted({t.name for o in objs if o.animation_data for t in o.animation_data.nla_tracks})
print("clipes do baú:", nomes)
faixa = clipe(objs, next((n for n in nomes if "abrir" in n.lower()), nomes[0] if nomes else None))
if faixa:
    bpy.context.scene.frame_set(faixa[1])
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 800, 800, escala=ESCALA)
if faixa:
    a, b = faixa
    render("bau-3d-fechado", a)
    render("bau-3d-abrindo-1", a + round((b - a) * 0.3))
    render("bau-3d-abrindo-2", a + round((b - a) * 0.6))
    render("bau-3d-aberto", b)
else:
    render("bau-3d-fechado", 1)
