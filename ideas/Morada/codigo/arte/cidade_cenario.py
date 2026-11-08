"""Cidade do Morada: categoria "cenario" — o que falta para montar as cenas da cidade inteira.

Terreno de ilha (areia, grama↔areia, costa de areia com espuma, costa de rocha, mar, platô com muro e rampa),
montanhas (4 tamanhos, morro verde, montanha com túnel), marcos (observatório, estádio, aeroporto, píer do navio de
cruzeiro, represa monumental em módulos, farol, delegacia) e prédios-marco (bombeiros, prédio-aquário, hospital,
lanchonete 24 horas, shopping, academia, apartamentos em U, torre com quadra no telhado, sala de enigmas, praça do
cristal, placa de quebra-cabeça e o efeito de fumaça e fogo de churrasqueira).

Uso:
  python3 -I morada-art/cenario_estampas.py SP/cidade_out        (letreiros, uma vez)
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_cenario.py -- SP/cidade_out [ids|grupos...]

Convenções: as de GUIA_CIDADE.md (grade de 15 m, origem no centro, base em z = 0, frente para −Y) e as cotas em
cenario_base.py (mar em −1,0 com fundo em −1,7; platô em +3,75). Peças animadas levam extra["animacoes"].
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402
import cenario_base as cnb  # noqa: E402

CAT = "cenario"
ROTULO = "Cenário"


def pecas():
    import cenario_terreno as ct
    import cenario_montanhas as cm
    import cenario_marcos as cmc
    import cenario_predios as cp
    out = []
    for mod, grupo in ((ct, "terreno"), (cm, "montanhas"), (cmc, "marcos"), (cp, "predios")):
        for id_, f in mod.PECAS:
            out.append((grupo, id_, f))
    return out


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], set(argv[1:])
    cnb.PASTA_EST = os.path.join(saida, CAT, "estampas")
    # prédios-marco: janelas coloridas do estilo regular (a base sorteia pela categoria)
    mb.JANELAS_ESTILO[CAT] = mb.JANELAS_ESTILO["predios_regulares"]
    cat = mb.Catalogo(CAT, saida, rotulo=ROTULO)
    for grupo, id_, f in pecas():
        if filtro and grupo not in filtro and id_ not in filtro:
            continue
        mb.limpa()
        it, op = f()
        if it.id != id_:
            print("aviso: id diferente", it.id, id_, flush=True)
        col = op.pop("colisao", None)
        if col is not None:
            it.colisao(col)
        extra = dict(op.pop("extra", None) or {})
        if isinstance(it, cnb.ItemC) and it.anims:
            extra["animacoes"] = it.lista_anim()
        extra.setdefault("cenario", grupo)
        dir_mini = op.pop("dir_mini", cb.DIR_TOPO)
        cb.exporta(cat, it, op["rotulo"], op["grupo"], tags=op.get("tags", ()), dir_mini=dir_mini, extra=extra,
                   colisao_plana=op.get("colisao_plana", True))
    cat.salva()


if __name__ == "__main__":
    main()
