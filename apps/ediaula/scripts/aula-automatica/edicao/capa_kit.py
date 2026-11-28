"""A abertura da parte no kit aprovado (REGRAS.md, seção 10; canvas do kit, frame 7): a capa do curso no fundo, com um
zoom bem lento, o título da parte num cartão verde com o selo "Aula N · Parte N" e a palavra principal no
marca-texto amarelo, e o personagem da capa chamando a criança num balão curto. Sai como pecas/capa-abertura.edisvg,
que o pecas.py põe no lugar do template de abertura do EdiAula.

Uso: capa_kit.py <base.edisvg> <pasta dos blocos> <pasta das peças> --arte capa-cade --aula 1 --parte 4
     --titulo "Faça alguém aparecer" --fala "Bora fazer alguém aparecer?" [--ponta 846,378] [--duracao 3]
--ponta: onde a ponta do balão cai (a cabeça do personagem na capa, em pixels da cena de 1920 x 1080).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edisvg_cena import AMARELO, BRANCO, TINTA, VAIVEM, Cena, nid, tf  # noqa: E402
from kit_cena import AMARELO_DEGRAU, ENTRELINHA_MARCA, balao_fala, caixa_marca, linha_de_base, marca_texto, medir  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("base")
ap.add_argument("blocos")
ap.add_argument("saida")
ap.add_argument("--arte", required=True)
ap.add_argument("--aula", required=True)
ap.add_argument("--parte", required=True)
ap.add_argument("--titulo", required=True)
ap.add_argument("--fala", required=True)
ap.add_argument("--ponta", default="846,378")
ap.add_argument("--duracao", type=float, default=3.0)
a = ap.parse_args()

T = a.duracao
c = Cena("Capa · abertura", 0, T, a.base, a.blocos, a.saida)
# A capa no lugar do fundo da cena, com um zoom bem lento a partir do meio de cima.
c.nos = []
c.trilhas = []
aid, w, h = c.imagem(a.arte)
capa = {"id": nid(), "name": "Fundo · capa do curso", "tag": "image", "assetId": aid,
        "attrs": {"x": "0", "y": "0", "width": "1920", "height": "1080"}, "text": "", "children": [],
        "transform": tf(), "visible": True, "locked": False}
g = c.grupo("Fundo · capa", 960, 400, [dict(capa, transform=tf(-960, -400))], op=100)
c.nos.append(g)
for p in ("sx", "sy"):
    c.trilha(g, p, [(0, 1.0, VAIVEM), (T, 1.04, None)])

# O cartão verde com o selo e o título (a última palavra no marca-texto).
palavras = a.titulo.split()
linha1, chave = " ".join(palavras[:-1]), palavras[-1]
kicker = f"Aula {int(a.aula)} · Parte {int(a.parte)}"
kw = medir(c, kicker, 28) + 60
# O cartão na largura do título (mais o respiro), nunca passando da área livre. A palavra-chave no marca-texto fica
# numa linha própria, com entrelinha que deixa a caixa amarela longe das letras de cima (Helena, 27/11/2026), e o
# cartão cresce para caber a caixa inteira com respiro embaixo.
tam = 104
CX = 96
CW = min(1180, max(700, 56 * 2 + max(medir(c, linha1, tam) if linha1 else 0, medir(c, chave, tam) + 34)))
yk = 196 + (tam * ENTRELINHA_MARCA if linha1 else 0)
CH = round(yk + caixa_marca(c, tam)[1] + 52)
CY = 992 - CH
filhos = [c.rect("degrau", 0, 9, CW, CH, "#075A3D", rx=36), c.rect("fundo", 0, 0, CW, CH, "#0B7A54", rx=36),
          c.rect("selo degrau", 56, 44, kw, 52, AMARELO_DEGRAU, rx=26), c.rect("selo", 56, 40, kw, 52, AMARELO, rx=26),
          c.texto("selo texto", kicker, 56 + kw / 2, 66 + linha_de_base(c, 28), 28, TINTA, ancora="middle")]
if linha1:
    filhos.append(c.texto("texto", linha1, 56, 196, tam, BRANCO))
filhos.append(marca_texto(c, chave, 56 - tam * 0.16, yk, tam, nome="Título · marca")[0])
cartao = c.grupo("Título da parte", CX, CY, filhos)
c.nos.append(cartao)
c.mostra(cartao, 0.15, None, sobe=24)

px, py = (float(v) for v in a.ponta.split(","))
balao_fala(c, "Chamada", a.fala, (px, py), 0.5, None, tam=46, maxw=440, along=0.12)

# A faixa da apresentadora fica livre: nada passa de x 1320 além da capa.
c.salvar("capa-abertura", refazer=True)
