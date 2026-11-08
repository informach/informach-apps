"""Textura de faixas das ruas do pacote (Roads.png) com o asfalto no tom da nossa cor "asfalto" (#3D424A).

Roda fora do Blender, com PIL e numpy (python3 -I):
  python3 -I morada-art/cidade_ruas_textura.py <Roads.png> <saida.png> [lado=1024]

O que faz:
- reduz para 1024² (o gerador já reduzia na importação);
- em cada região da textura usada por uma das 7 ruas do pacote (os retângulos de UV abaixo) mede a média do asfalto
  (pixels escuros, sem as faixas) em luz linear e multiplica cada canal para essa média ficar igual à do nosso
  asfalto. O ganho é multiplicativo: a variação suave (borda mais escura, meio mais claro) continua, só que em volta
  da nossa média; fora dessas regiões vale o ganho médio de todas;
- as faixas brancas e amarelas não mudam: o ganho entra aos poucos entre o asfalto e a tinta (luminância de 80 a 150
  de 255), para a borda antisserrilhada das faixas não ganhar contorno.
"""
import sys

import numpy as np
from PIL import Image

ALVO = "#3D424A"
# retângulos de UV (u0, v0, u1, v1) da face de asfalto de cada peça do pacote (lidos do FBX com cidade_base)
REGIOES = {
    "road_001": (0.0, 0.752, 0.25, 0.998), "road_003": (0.501, 0.751, 0.749, 0.999),
    "road_009": (0.562, 0.501, 0.688, 0.749), "road_013": (0.751, 0.251, 0.999, 0.499),
    "road_019": (0.25, 0.0, 0.5, 0.25), "road_020": (0.0, 0.5, 0.25, 0.75),
    "road_022": (0.812, 0.5, 0.938, 0.75),
}
L_ASF, L_TINTA = 80.0, 150.0


def lin(c):
    return np.power(c, 2.2)


def srgb(c):
    return np.power(np.clip(c, 0, 1), 1 / 2.2)


def main(entrada, saida, lado=1024):
    im = Image.open(entrada).convert("RGB")
    if im.size[0] != lado:
        im = im.resize((lado, lado), Image.LANCZOS)
    a = np.asarray(im).astype(np.float64) / 255.0
    L = a.mean(axis=2) * 255
    peso = np.clip((L_TINTA - L) / (L_TINTA - L_ASF), 0, 1)  # 1 no asfalto, 0 na tinta
    alvo = lin(np.array([int(ALVO[i:i + 2], 16) for i in (1, 3, 5)]) / 255.0)
    al = lin(a)
    ganho = np.ones((lado, lado, 3))
    ganhos = []
    for nome, (u0, v0, u1, v1) in REGIOES.items():
        x0, x1 = int(round(u0 * lado)), int(round(u1 * lado))
        y0, y1 = int(round((1 - v1) * lado)), int(round((1 - v0) * lado))  # v para cima, linha da imagem para baixo
        reg = al[y0:y1, x0:x1][L[y0:y1, x0:x1] < L_ASF]
        g = alvo / reg.mean(axis=0)
        ganhos.append(g)
        ganho[y0:y1, x0:x1] = g
        print(nome, "média antes", np.round(srgb(reg.mean(axis=0)) * 255, 1), "ganho", np.round(g, 3))
    medio = np.mean(ganhos, axis=0)
    fora = np.all(ganho == 1, axis=2)
    ganho[fora] = medio
    g_eff = 1 + (ganho - 1) * peso[..., None]
    out = srgb(al * g_eff)
    Image.fromarray(np.round(out * 255).astype(np.uint8)).save(saida, optimize=True)
    # conferência
    b = np.asarray(Image.open(saida)).astype(np.float64) / 255.0
    for nome, (u0, v0, u1, v1) in REGIOES.items():
        x0, x1 = int(round(u0 * lado)), int(round(u1 * lado))
        y0, y1 = int(round((1 - v1) * lado)), int(round((1 - v0) * lado))
        m = L[y0:y1, x0:x1] < L_ASF
        print(nome, "média depois", np.round(srgb(lin(b[y0:y1, x0:x1][m]).mean(axis=0)) * 255, 1), "alvo",
              [int(ALVO[i:i + 2], 16) for i in (1, 3, 5)])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)
