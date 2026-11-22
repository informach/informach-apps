"""Renders com fundo transparente dos modelos da Ilha para as animações da Aula 3 (o farol que acende e a
personalização), na luz e na câmera de ilha-render-modelos.py.

    <blender-venv>/python ilha-render-aula3.py <pasta dos glb> <pasta de saída>

Os GLB saem da biblioteca de modelos dos cursos (docs/design/ilha-do-farol-blender/modelos.json, com o sha de
cada um). Cada grupo usa uma medida só por pixel, para as figuras irem juntas sem reescalar:
- os quatro faróis, apagados (pose de repouso) e acesos (o clipe "aceso"): farol-<nome>.png e farol-<nome>-aceso.png;
- os oito personagens parados, na medida do aventureiro: personagem-<nome>.png;
- os quatro barcos e as três chaves: barco-<nome>.png e chave-<nome>.png.

Os cenários não saem daqui: o GLB traz a cúpula do céu, que cobre a ilha no render. Use as miniaturas da
galeria do jogo (docs/design/ilha-do-farol-blender/galeria no Sistema Zero), as mesmas do Passo a passo.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilha_render import caixa, clipe, importar, limpar, luz_e_camera, render  # noqa: E402

FAROIS = ["farol-listrado", "farol-de-pedra", "farol-de-madeira", "farol-colorido"]
PERSONAGENS = ["aventureiro", "menina-de-laco", "marinheira", "menino-de-bone", "exploradora-de-chapeu", "pirata",
               "mergulhador", "robo"]
BARCOS = ["veleiro", "barco-de-pesca", "lancha", "barco-pirata"]
CHAVES = ["chave-dourada", "chave-prateada", "chave-de-estrela"]


def maior_caixa(nomes, clip=None):
    """A caixa que cabe todos os modelos do grupo (a mesma câmera para todos)."""
    lo = hi = None
    for nome in nomes:
        limpar()
        objs = importar(nome)
        clipe(objs, clip)
        a, b = caixa(objs)
        lo = a if lo is None else type(a)((min(lo.x, a.x), min(lo.y, a.y), min(lo.z, a.z)))
        hi = b if hi is None else type(b)((max(hi.x, b.x), max(hi.y, b.y), max(hi.z, b.z)))
    return lo, hi


def grupo(nomes, prefixo, w, h, clips=((None, ""),)):
    lo, hi = maior_caixa(nomes, clips[0][0])
    # A medida que luz_e_camera daria ao maior do grupo, fixa para todos.
    altura, largura = hi.z - lo.z, max(hi.x - lo.x, hi.y - lo.y)
    escala = max(altura * 1.35 * w / h, largura * 1.35) * max(1, h / w)
    for nome in nomes:
        for clip, sufixo in clips:
            limpar()
            objs = importar(nome)
            faixa = clipe(objs, clip)
            a, b = caixa(objs)
            # Centrado no próprio modelo, na medida do grupo.
            luz_e_camera(a, b, w, h, escala=escala)
            quadro = (faixa[0] + faixa[1]) // 2 if faixa else 1
            render(f"{prefixo}{nome.removeprefix(prefixo)}{sufixo}", quadro)


grupo(FAROIS, "farol-", 520, 1000, clips=((None, ""), ("aceso", "-aceso")))
grupo(PERSONAGENS, "personagem-", 600, 800, clips=(("parado", ""),))
grupo(BARCOS, "barco-", 800, 600)
grupo(CHAVES, "chave-", 600, 600)
