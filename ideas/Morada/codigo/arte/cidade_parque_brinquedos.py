"""Biblioteca de cidade do Morada: brinquedos do parque — categoria "parque_brinquedos".

Uso (ver GUIA_CIDADE.md e GUIA_PARQUE.md):
  python3 -I morada-art/parque_brinquedos_estampas.py SP/cidade_out          (uma vez: lava e letreiros)
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_parque_brinquedos.py -- SP/cidade_out [ids...]

Convenções: metros, Z para cima, frente para −Y, origem no centro da peça com o chão em z = 0. As áreas grandes cobrem
quadras inteiras de 15 m (extra "quadras": [nx, ny]); o chão delas é grama com caminhos de ladrilho rosado iguais ao
piso_grama_caminho, com entradas no meio das bordas das quadras.

Animações (filhos com extras glTF; a lista vai no catálogo em extra["animacoes"], com "pivo" e, nos aninhados, "em"):
  girar    {"anima": "girar", "eixo": "y"|"z", "velocidade": graus/s}     roda-gigante (eixo z do glTF), carrossel,
                                                                           xícaras, gôndola da torre
  balancar {"anima": "balancar", "angulo", "periodo", "eixo": "z"}       barco viking
  piscar   {"anima": "piscar", "periodo"}                                 lâmpadas da roda, do carrossel, da torre
  percurso {"anima": "percurso", "pontos", "velocidade", "atraso", "fechado": true}
           carrinhos das montanhas-russas (pontos amostrados do próprio trilho), cavalinhos do carrossel (círculo que
           sobe e desce), carrinhos do bate-bate, trenzinho.
Assentos: slots "slot_assento_<n>" (0,5 × 0,5 × 0,9) presos ao nó que anda (em = nó do carrinho, cabine, cavalo...).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402
import parque_brinquedos_base as pb  # noqa: E402

CAT = "parque_brinquedos"
MINI_ALTA = (0.55, -1.0, 0.6)
MINI_AREA = (0.55, -1.0, 0.95)


def _pecas():
    import parque_brinquedos_montanhas as mr
    import parque_brinquedos_atracoes as at
    import parque_brinquedos_castelo as ca
    return [
        # id, rótulo, grupo, tags, função, extra, miniatura
        ("montanha_russa_dragao", "Montanha-russa do dragão (3 × 2)", "montanha_russa_dragao",
         ["brinquedo", "montanha_russa", "animado", "3x2", "assentos"], getattr(mr, "montanha_dragao", None), {"quadras": [3, 2]},
         MINI_AREA),
        ("montanha_russa_loopings", "Montanha-russa azul com loopings (2 × 2)", "montanha_russa_loopings",
         ["brinquedo", "montanha_russa", "animado", "2x2", "assentos"], getattr(mr, "montanha_azul", None), {"quadras": [2, 2]},
         MINI_AREA),
        ("roda_gigante", "Roda-gigante colorida (2 × 1)", "roda_gigante",
         ["brinquedo", "animado", "assentos", "luz", "2x1"], getattr(at, "roda_gigante", None), {"quadras": [2, 1]},
         MINI_ALTA),
        ("parque_aquatico", "Parque aquático (2 × 2)", "parque_aquatico", ["brinquedo", "agua", "2x2", "assentos"],
         getattr(at, "parque_aquatico", None), {"quadras": [2, 2]}, MINI_AREA),
        ("carrossel", "Carrossel de cavalinhos", "carrossel", ["brinquedo", "animado", "assentos", "luz"],
         getattr(at, "carrossel", None), {}, MINI_ALTA),
        ("xicaras_malucas", "Xícaras malucas", "xicaras_malucas", ["brinquedo", "animado", "assentos"], getattr(at, "xicaras", None), {},
         MINI_ALTA),
        ("barco_viking", "Barco viking", "barco_viking", ["brinquedo", "animado", "assentos"], getattr(at, "barco_viking", None), {},
         MINI_ALTA),
        ("torre_queda", "Torre de queda livre", "torre_queda", ["brinquedo", "animado", "assentos", "luz"],
         getattr(at, "torre_queda", None), {}, MINI_ALTA),
        ("carrinhos_bate_bate", "Carrinhos bate-bate", "carrinhos_bate_bate",
         ["brinquedo", "animado", "assentos", "coberto"], getattr(at, "bate_bate", None), {"quadras": [1, 1]}, MINI_ALTA),
        ("trenzinho_infantil", "Trenzinho infantil", "trenzinho_infantil", ["brinquedo", "animado", "assentos"],
         getattr(at, "trenzinho", None), {"quadras": [1, 1]}, MINI_AREA),
        ("castelo_portao", "Casinha-portão do castelo", "castelo_parque", ["castelo", "modular"], getattr(ca, "portao", None), {},
         MINI_ALTA),
        ("castelo_torre_alta", "Torre alta do castelo", "castelo_parque", ["castelo", "modular"], getattr(ca, "torre_alta", None), {},
         MINI_ALTA),
        ("castelo_torre_baixa", "Torre baixa do castelo", "castelo_parque", ["castelo", "modular"], getattr(ca, "torre_baixa", None), {},
         MINI_ALTA),
        ("castelo_mureta", "Mureta do castelo", "castelo_parque", ["castelo", "modular"], getattr(ca, "mureta", None), {}, MINI_ALTA),
        ("castelo_mureta_curva", "Mureta curva do castelo", "castelo_parque", ["castelo", "modular"],
         getattr(ca, "mureta_curva", None), {}, MINI_ALTA),
        ("castelo_cone_telhado", "Cone de telhado do castelo", "castelo_parque", ["castelo", "modular", "telhado"],
         getattr(ca, "cone_telhado", None), {}, MINI_ALTA),
        ("estatua_menina", "Estátua gigante da menina de vestido azul", "estatua_menina", ["decoracao", "estatua"],
         getattr(ca, "estatua_menina", None), {}, (0.3, -1.0, 0.25)),
    ]


def gera(saida, sel):
    pb.EST_DIR = os.path.join(saida, CAT, "estampas")
    cat = mb.Catalogo(CAT, saida, rotulo="Brinquedos do parque")
    for id_, rot, grupo, tags, f, extra, mini in _pecas():
        if (sel and id_ not in sel) or f is None:
            continue
        mb.limpa()
        it = pb.ItemP(id_)
        f(it)
        ex = dict(extra)
        anims = it.lista_animacoes()
        if anims:
            ex["animacoes"] = anims
        fix = "apoio" if id_ == "castelo_cone_telhado" else "chao"  # o cone vai em cima de uma torre
        cat.exporta(it, rot, grupo=grupo, tags=tags, miniatura_dir=mini, extra=ex, fixacao=fix)
    cat.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    gera(args[0], args[1:])
