"""Renders com fundo transparente dos modelos 3D da Ilha, para as animações de conceito da Ilha do Farol.

    <blender-venv>/python ilha-render-modelos.py <pasta dos glb> <pasta de saída>

O bpy 5.2.3 desta máquina está em ~/projects/artes-3d-sp/blender-venv. Os GLB saem da biblioteca de modelos dos
cursos: cada packages/studio/src/core/course-models/m-<sha>.generated.ts do Sistema Zero tem o arquivo em base64
(o sha está em docs/design/ilha-do-farol-blender/modelos.json).

Cada modelo entra sozinho, com a luz da capa do Passo a passo (docs/design/ilha-do-farol-blender/capa.py)
e uma câmera de frente, um pouco do alto, como no jogo. O aventureiro sai em quatro quadros do clipe
"andando" (andando-1 a andando-4) e no "parado"; o farol listrado sai apagado (sem clipe); as pedras, sozinhas.

Para a Aula 2 (a chave): a chave dourada na mesma câmera e na mesma escala do aventureiro (chave.png, 600 x 600,
mesma medida por pixel do aventureiro-parado, para as duas figuras irem juntas sem reescalar), e a vista de cima
do aventureiro e da chave (aventureiro-de-cima.png e chave-de-cima.png, 600 x 600, câmera reta de cima, a mesma
medida por pixel nas duas): a experiência da Parte 3, em que de cima a chave parece estar sobre o personagem.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilha_render import (  # noqa: E402
    caixa,
    clipe,
    importar,
    limpar,
    luz_e_camera,
    render,
)

# Aventureiro: parado e quatro quadros do passo.
limpar()
objs = importar("aventureiro")
faixa = clipe(objs, "andando")
lo, hi = caixa(objs)
ESCALA_AVENTUREIRO = luz_e_camera(lo, hi, 600, 800)
if faixa:
    a, b = faixa
    for k in range(4):
        render(f"aventureiro-andando-{k + 1}", a + round((b - a) * k / 4))
clipe(objs, "parado")
render("aventureiro-parado", 1)

# Farol listrado, apagado (pose de repouso, sem clipe).
limpar()
objs = importar("farol-listrado")
clipe(objs, None)
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 520, 1000)
render("farol-listrado", 1)

# As pedras da ilha (a que esconde a chave no jogo), sem a chave.
limpar()
objs = importar("pedras")
clipe(objs, None)
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 800, 600)
render("pedras", 1)

# Aula 2: a chave dourada na escala do aventureiro (a câmera de 600 x 800 tem a medida de ESCALA_AVENTUREIRO na
# altura; num quadro de 600 x 600, a mesma medida por pixel é 0,75 dela).
limpar()
objs = importar("chave-dourada")
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 600, escala=ESCALA_AVENTUREIRO * 0.75)
render("chave", 1)

# Aula 2: de cima, o aventureiro parado e a chave, na mesma medida por pixel (2,2 unidades em 600 px).
limpar()
objs = importar("aventureiro")
clipe(objs, "parado")
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 600, escala=2.2, de_cima=True)
render("aventureiro-de-cima", 1)
limpar()
objs = importar("chave-dourada")
lo, hi = caixa(objs)
luz_e_camera(lo, hi, 600, 600, escala=2.2, de_cima=True)
render("chave-de-cima", 1)
