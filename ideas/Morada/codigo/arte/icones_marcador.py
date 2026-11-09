"""Marcador 3D do morador escolhido: a casinha do Morada, girando e flutuando, com a cor do humor geral.

Uso: MOVEIS_THREADS=1 nice -n 10 blender-venv/bin/python -I icones_marcador.py -- <saida>   (ex.: SP/icones_out/marcador)

Grava marcador.glb (cor de "humor ótimo" e a tabela de cores nos extras, para o motor trocar) e marcador_<humor>.glb
(otimo, bom, ruim, pessimo: verde, amarelo, laranja e vermelho, já pintados).

Estrutura (eixos do glTF):
  marcador            raiz, no ponto acima da cabeça; extras {"marcador": true, "laco": 4, "cores_humor": {...},
                      "materiais_cor": ["marcador_corpo", "marcador_telhado"]}
    flutua            o clipe "laco" sobe e desce 2,5 cm (duas vezes a cada 4 s)
      gira            o clipe "laco" dá uma volta a cada 4 s (90°/s) em volta de Y
        casinha ...   corpo, telhado, chaminé, porta e janela (frente e trás) e o contorno do cartum
A casa tem 0,22 m de largura e 0,29 m de altura, com a base em y = 0 do nó "gira".
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import efeitos_glb as E  # noqa: E402
import icones_desenhos as D  # noqa: E402

C = D.C
P = 4.0


def casinha(cor, pai):
    corpo = E.material("marcador_corpo", cor, emis=0.35, rough=0.45)
    tel = E.material("marcador_telhado", D.escuro(cor, 0.22), emis=0.25, rough=0.5)
    det = E.material("marcador_detalhe", C["creme_claro"], emis=0.3, rough=0.5)
    # corpo: pentágono boleado (paredes até 0,13 m, cumeeira a 0,235 m)
    perfil = E.forma("M-0.1 0 H0.1 Q0.104 0 0.104 -0.004 V-0.126 L0.004 -0.232 Q0 -0.236 -0.004 -0.232 L-0.104 -0.126 "
                     "V-0.004 Q-0.104 0 -0.1 0 Z", 1.0)
    b = E.extrusao("casa_corpo", perfil, 0.11, corpo, pai, bisel=0.012)
    E.contorno(b, 0.006)
    # telhado: faixa em "V" invertido, mais funda que o corpo (beiral)
    tet = [(-0.142, 0.112), (0.0, 0.272), (0.142, 0.112), (0.118, 0.094), (0.0, 0.228), (-0.118, 0.094)]
    t = E.extrusao("casa_telhado", tet, 0.136, tel, pai, bisel=0.008)
    E.contorno(t, 0.006)
    # chaminé
    ch = E.extrusao("casa_chamine", [(0.052, 0.15), (0.084, 0.15), (0.084, 0.262), (0.052, 0.262)], 0.04, tel, pai,
                    bisel=0.005, loc=(0, 0.02, 0))
    E.contorno(ch, 0.005)
    # porta em arco e janela redonda, na frente e atrás
    porta = E.forma("M-0.03 0 H0.03 V-0.062 Q0.03 -0.092 0 -0.092 Q-0.03 -0.092 -0.03 -0.062 Z", 1.0)
    janela = [(0.021 * E.math.cos(2 * E.math.pi * k / 20), 0.165 + 0.021 * E.math.sin(2 * E.math.pi * k / 20)) for k in range(20)]
    for lado, y in (("frente", -0.058), ("tras", 0.058)):
        p = E.extrusao(f"porta_{lado}", porta, 0.01, det, pai, bisel=0.002, loc=(0, y, 0.004))
        E.contorno(p, 0.004)
        j = E.extrusao(f"janela_{lado}", janela, 0.01, det, pai, bisel=0.002, loc=(0, y, 0))
        E.contorno(j, 0.004)


def gera(saida, nome, cor):
    E.limpa()
    E.bpy.context.scene.frame_end = 1
    cores = {k: {"corpo": v, "telhado": D.escuro(v, 0.22)} for k, v in D.HUMOR_GERAL.items()}
    r = E.vazio("marcador", marcador=True, laco=P, cores_humor=cores, materiais_cor=["marcador_corpo", "marcador_telhado"],
                regra="humor geral: ótimo verde, bom amarelo, ruim laranja, péssimo vermelho")
    fl = E.vazio("flutua", r)
    gi = E.vazio("gira", fl)
    casinha(cor, gi)
    E.anima(fl, P, lambda t: {"loc": (0, 0, 0.025 * E.math.sin(2 * E.math.pi * 2 * t / P))})
    E.anima(gi, P, lambda t: {"rot": (0, 0, 360 * t / P)})
    return E.exporta(r, os.path.join(saida, nome))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida = os.path.abspath(argv[0])
    info = gera(saida, "marcador.glb", D.HUMOR_GERAL["otimo"])
    print("ok marcador.glb", info["tris"], "tri", info["bytes"] // 1024, "KB", info["animacoes"], flush=True)
    for k, cor in D.HUMOR_GERAL.items():
        for m in list(E.bpy.data.materials):
            if m.name.startswith("marcador_"):
                E.bpy.data.materials.remove(m)
        info = gera(saida, f"marcador_{k}.glb", cor)
        print("ok", k, info["bytes"] // 1024, "KB", flush=True)


if __name__ == "__main__":
    main()
