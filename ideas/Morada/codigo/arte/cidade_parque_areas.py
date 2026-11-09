"""Biblioteca de cidade do Morada: categoria "parque_areas" (placas de caminho de parque, lago, zoológico, skate,
palco de festival, tendas de circo, quiosques, playground, chafariz, obelisco, arco de treliça, coreto, banco e poste).

Uso (GUIA_CIDADE.md e GUIA_PARQUE.md):
  MOVEIS_THREADS=1 CIDADE_PACOTE_FBX=... CIDADE_PACOTE_TEX=... CIDADE_PACOTE_TEXTURAS=... \
    blender-venv/bin/python -I morada-art/cidade_parque_areas.py -- SP/cidade_out [ids|grupos...]

Convenções:
- metros, Z para cima, frente para −Y, origem no centro da peça, chão em z = 0 (calçada e grama no mesmo nível).
- As placas de caminho (15 × 15 m) usam o caminho do piso_grama_caminho: ladrilho rosado de 2,6 m (meia largura 1,3),
  juntas a cada 0,6 m contadas da borda e linha do meio em madeira_rosada, guias baixas de concreto de 0,2 m (topo em
  z = 0,035) e grama com faixas de corte de 5 m em X. Os caminhos chegam às bordas no meio da quadra, então casam
  com o piso_grama_caminho, entre si e com as áreas grandes (lago e zoológico têm entradas no meio das quadras).
- Animações: filho com a origem no pivô e extras glTF (anima girar/balancar/piscar/trocar/percurso); a mesma lista vai
  no catálogo em extra["animacoes"] (com "pivo" nos eixos do glTF).
- Assentos: slots assento_1, assento_2... de 0,5 × 0,5 × 0,9 m (no balanço, na gangorra, no gira-gira e no pedalinho
  o slot é filho do nó animado: "em" = nome do nó).
- Luz noturna: lâmpadas com "luz", contornos com neon/neon_rosa/neon_roxo, letreiros com estampa emissiva.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402
import parque_areas_base as pb  # noqa: E402
from parque_areas_base import (ItemP, Malha, Terreno, Rede, W_CAM, G_GUIA, NIVEIS_GUIA, z_guia, cor_grama,  # noqa: E402
                               tufo, flores, arbusto, moita, arvore, arvore_alta, mover, gira_z, terreno_caminho)
import parque_areas_areas as pa  # noqa: E402
import parque_areas_props as pp  # noqa: E402

V = Vector
H, Q, ZF = cb.H, cb.Q, cb.Z_FUNDO
CAT = "parque_areas"
SAIDA = ""
EST = {}
DIR_ALTO = (0.55, -1.0, 0.55)
DIR_MEIO = (0.55, -1.0, 0.85)


def estampa(nome, emissao=0.0):
    chave = (nome, emissao)
    if chave not in EST:
        png = os.path.join(SAIDA, CAT, "estampas", nome + ".png")
        EST[chave] = mb.material_estampa(f"parque_{nome}" + ("_luz" if emissao else ""), png, emissao=emissao)
    return EST[chave]


# =====================================================================================================================
# Placas de caminho (15 × 15)
# =====================================================================================================================
LIM = (-H, -H, H, H)


def enfeites_grama(it, rede, pontos, margem=0.9, borda=0.7):
    """Tufos e flores só onde é grama (longe do caminho e da borda da quadra)."""
    for k, (x, y) in enumerate(pontos):
        if abs(x) > H - borda or abs(y) > H - borda:
            continue
        f = float(rede.f(np.array([x]), np.array([y]))[0])
        if f < W_CAM + G_GUIA + margem:
            continue
        if k % 3 == 2:
            it.add(flores(x, y, (("amarelo", "branco"), ("rosa", "branco"), ("lilas", "amarelo"))[k % 3]))
        else:
            it.add(tufo(x, y, cor="grama_escura" if k % 2 else "folha"))


PONTOS_ENFEITE = [(-5.2, 3.1), (2.4, -4.6), (5.8, 5.2), (-2.6, -2.5), (-6.1, -5.8), (3.7, 2.6), (0.6, 6.3), (-3.9, 6.6),
                  (6.4, -1.9), (-0.8, -6.2), (4.6, -5.9), (-5.9, -1.2), (2.9, 4.9), (-4.4, -4.6), (5.6, 2.9),
                  (-2.9, 4.2), (6.3, -6.3), (-6.4, 5.0)]


def placa_base(it, rede, enfeites=True, **k):
    t = terreno_caminho(it, rede, **k)
    it.add(rede.juntas())
    if enfeites:
        enfeites_grama(it, rede, PONTOS_ENFEITE)
    return t


def p_caminho_reta(it):
    r = Rede(limite=LIM)
    r.traco([(0, -H), (0, H)])
    placa_base(it, r)


def p_caminho_curva(it):
    r = Rede(limite=LIM)
    r.traco(pb.arco(H, -H, H, 180, 90, 48), ajusta=True)
    placa_base(it, r)


def p_caminho_cruz(it):
    r = Rede(limite=LIM)
    r.traco([(0, -H), (0, H)])
    r.traco([(-H, 0), (H, 0)])
    placa_base(it, r)


def p_caminho_t(it):
    r = Rede(limite=LIM)
    r.traco([(-H, 0), (H, 0)])
    r.traco([(0, -H), (0, 0)])
    placa_base(it, r)


def p_caminho_fim(it):
    """Fim de caminho: chega pelo sul e termina numa pracinha redonda com desenho no piso."""
    r = Rede(limite=LIM, k=1.2)
    r.traco([(0, -H), (0, 0.6)])
    r.disco(0, 0.6, 2.9)
    placa_base(it, r)
    roseta(it, 0, 0.6, 2.9, raios=6)


def p_caminho_dupla(it):
    r = Rede(limite=LIM)
    r.traco([(-3.75, -H), (-3.75, H)])
    r.traco([(3.75, -H), (3.75, H)])
    placa_base(it, r)


def p_caminho_canto(it):
    """Canto em diagonal: entra pelo sul e sai pelo leste com um trecho reto a 45°."""
    pts = mb._arredonda_cantos([(0, -H), (0, -3.6), (3.6, 0), (H, 0)], 2.4, n=10)
    r = Rede(limite=LIM)
    r.traco([(p.x, p.y) for p in pts], ajusta=True)
    placa_base(it, r)


def p_caminho_rotatoria(it):
    R = 4.3
    r = Rede(limite=LIM, k=1.1)
    r.traco(pb.arco(0, 0, R, 0, 360, 96)[:-1], fechado=True)
    for ang in (0, 90, 180, 270):
        c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        r.traco([(H * c, H * s), (R * c, R * s)])
    placa_base(it, r)
    # canteiro redondo no miolo: mureta creme, terra, flores e topiaria
    it.add(canteiro_redondo(0, 0, 1.75))


def p_praca_redonda(it):
    """Praça redonda no centro (raio 5,6), com 4 caminhos até as bordas e roseta no piso (o chafariz vai no meio)."""
    R = 5.6
    r = Rede(limite=LIM, k=1.4)
    for ang in (0, 90, 180, 270):
        c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        r.traco([(H * c, H * s), (R * 0.5 * c, R * 0.5 * s)])
    r.disco(0, 0, R)
    placa_base(it, r)
    roseta(it, 0, 0, R, raios=8, grande=True)
    for xs, ys in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        cx, cy = xs * 5.9, ys * 5.9
        it.add(arbusto(cx + xs * 0.4, cy + ys * 0.4, r=0.62, cor="folha", seg=10),
               arbusto(cx - xs * 0.5, cy + ys * 0.5, r=0.4, cor="folha_clara", seg=8),
               flores(cx + xs * 0.55, cy - ys * 0.55, ("rosa", "branco")))


def roseta(it, cx, cy, R, raios=8, grande=False, z=0.0):
    """Desenho no piso de uma pracinha: anéis de pedra creme e terracota e raios (decalques finos)."""
    zz = z + 0.003
    objs = [pb.faixa_2d(pb.arco(cx, cy, R - 0.55, 0, 360, 96), 0.32, zz, "creme", fechado=True, nome="anel"),
            pb.faixa_2d(pb.arco(cx, cy, R - 0.95, 0, 360, 96), 0.08, zz, "terracota_clara", fechado=True,
                        nome="anel")]
    if grande:
        objs.append(pb.faixa_2d(pb.arco(cx, cy, 2.2, 0, 360, 72), 0.18, zz, "terracota_clara", fechado=True,
                                nome="anel"))
        objs.append(pb.decal(pb.arco(cx, cy, 1.2, 0, 360, 48)[:-1], zz, "creme", nome="miolo"))
        objs.append(pb.faixa_2d(pb.arco(cx, cy, 1.2, 0, 360, 48), 0.08, zz + 0.001, "terracota", fechado=True,
                                nome="anel"))
        r0, r1 = 2.35, R - 1.05
    else:
        objs.append(pb.decal(pb.arco(cx, cy, 0.7, 0, 360, 36)[:-1], zz, "terracota_clara", nome="miolo"))
        r0, r1 = 0.85, R - 1.05
    for k in range(raios * 2):
        a = math.radians(360 * k / (raios * 2) + 360 / (raios * 4))
        w0, w1 = (0.12, 0.34) if k % 2 == 0 else (0.06, 0.16)
        c, s = math.cos(a), math.sin(a)
        nx, ny = -s, c
        pts = [(cx + c * r0 + nx * w0, cy + s * r0 + ny * w0), (cx + c * r1 + nx * w1, cy + s * r1 + ny * w1),
               (cx + c * r1 - nx * w1, cy + s * r1 - ny * w1), (cx + c * r0 - nx * w0, cy + s * r0 - ny * w0)]
        objs.append(pb.decal(pb.ccw(pts), zz, "creme" if k % 2 == 0 else "terracota_clara", nome="raio"))
    it.add(mb.junta(objs, "roseta"))


def canteiro_redondo(cx, cy, R, z=0.0):
    ps = [mb.torno([(R - 0.22, z - 0.02), (R, z - 0.02), (R + 0.02, z + 0.2), (R - 0.04, z + 0.26),
                    (R - 0.22, z + 0.26), (R - 0.24, z + 0.16)], x=cx, y=cy, cor="creme", seg=28),
          mb.cilindro(R - 0.2, 0.18, x=cx, y=cy, z=z, cor="terra", seg=28, bisel=0.0),
          arbusto(cx, cy, r=0.55, cor="folha_escura", z=z + 0.18, alt=1.3, seg=10),
          pb.bola(0.32, cx, cy, z + 1.55, cor="folha_escura", sub=1)]
    cores = (("rosa", "branco"), ("amarelo", "laranja"), ("lilas", "branco"), ("vermelho", "rosa_bebe"))
    for k in range(4):
        a = 2 * math.pi * k / 4 + math.pi / 4
        ps.append(flores(cx + (R - 0.6) * math.cos(a), cy + (R - 0.6) * math.sin(a), cores[k % 4], z=z + 0.18, n=4))
    return mb.junta(ps, "canteiro")


# =====================================================================================================================
# Registro e exportação
# =====================================================================================================================
def exporta(cat, it, rotulo, grupo, tags, mini=None, col=None, extra=None, pacote=False):
    ex = dict(extra or {})
    if getattr(it, "animados", None):
        ex["animacoes"] = it.lista_animacoes()
    if col is not None:
        it.colisao(col)
    return cat.exporta(it, rotulo, grupo=grupo, tags=tags, miniatura_dir=mini or DIR_ALTO, pacote=pacote,
                       extra=ex or None)


def col_laje(nx=1, ny=1):
    return [((0, 0, ZF), (nx * Q, ny * Q, -ZF))]


T_CAM = ["modular", "parque", "caminho", "grama"]
PECAS = [
    # (id, rótulo, grupo, tags, função, opções)
    ("caminho_parque_reta", "Caminho de parque reto", "caminho_parque", T_CAM + ["reta"], p_caminho_reta, {}),
    ("caminho_parque_curva", "Caminho de parque em curva", "caminho_parque", T_CAM + ["curva"], p_caminho_curva, {}),
    ("caminho_parque_cruz", "Caminho de parque em cruz", "caminho_parque", T_CAM + ["cruzamento"], p_caminho_cruz,
     {}),
    ("caminho_parque_t", "Caminho de parque em T", "caminho_parque", T_CAM + ["cruzamento"], p_caminho_t, {}),
    ("caminho_parque_rotatoria", "Rotatória de caminho com canteiro", "caminho_parque", T_CAM + ["rotatoria"],
     p_caminho_rotatoria, {}),
    ("caminho_parque_fim", "Fim de caminho com pracinha", "caminho_parque", T_CAM + ["fim"], p_caminho_fim, {}),
    ("caminho_parque_duplo", "Caminhos paralelos (duplo)", "caminho_parque", T_CAM + ["duplo"], p_caminho_dupla, {}),
    ("caminho_parque_canto", "Caminho em canto diagonal", "caminho_parque", T_CAM + ["diagonal", "curva"],
     p_caminho_canto, {}),
    ("praca_redonda", "Praça redonda com 4 caminhos", "caminho_parque", T_CAM + ["praca"], p_praca_redonda, {}),
    # áreas grandes
    ("lago_caminho", "Lago com caminho em volta (2 × 2)", "lago_caminho", ["parque", "lago", "agua", "2x2", "animado"],
     lambda it: pa.p_lago(it), {}),
    ("zoologico", "Área do zoológico (2 × 2)", "zoologico", ["parque", "zoologico", "recintos", "2x2"],
     lambda it: pa.p_zoologico(it), {}),
    ("pista_skate", "Pista de skate (bowl)", "pista_skate", ["parque", "skate", "bowl", "esporte"],
     lambda it: pa.p_skate(it), {}),
    ("playground", "Playground (balanço, escorregador, gangorra, trepa-trepa, areia)", "playground",
     ["parque", "playground", "infantil", "animado"], lambda it: pa.p_playground(it), {}),
    ("palco_festival", "Palco de festival", "palco_festival", ["parque", "palco", "show", "festival", "animado", "neon"],
     lambda it: pa.p_palco(it), {}),
    # tendas de circo
    ("tenda_circo_grande", "Tenda de circo grande (vermelha e branca)", "tenda_circo",
     ["parque", "circo", "tenda", "animado"], lambda it: pp.p_tenda_grande(it), {}),
    ("tenda_circo_media", "Tenda de circo média (roxa e amarela)", "tenda_circo", ["parque", "circo", "tenda", "animado"],
     lambda it: pp.p_tenda_media(it), {}),
    ("tenda_circo_pequena", "Tenda de circo pequena (azul e branca)", "tenda_circo",
     ["parque", "circo", "tenda", "animado"], lambda it: pp.p_tenda_pequena(it), {}),
    # quiosques e bilheteria
    ("quiosque_sorvete", "Quiosque de sorvete", "quiosque", ["parque", "quiosque", "comida", "letreiro"],
     lambda it: pp.p_quiosque_sorvete(it), {}),
    ("quiosque_pipoca", "Quiosque de pipoca", "quiosque", ["parque", "quiosque", "comida", "letreiro", "animado"],
     lambda it: pp.p_quiosque_pipoca(it), {}),
    ("quiosque_algodao_doce", "Quiosque de algodão-doce", "quiosque",
     ["parque", "quiosque", "comida", "letreiro", "animado"], lambda it: pp.p_quiosque_algodao(it), {}),
    ("bilheteria_ingressos", "Bilheteria de ingressos", "quiosque", ["parque", "bilheteria", "letreiro", "animado"],
     lambda it: pp.p_bilheteria(it), {}),
    # praça
    ("chafariz_praca", "Chafariz grande de praça", "chafariz", ["parque", "praca", "chafariz", "agua", "animado"],
     lambda it: pp.p_chafariz(it), {}),
    ("fountain_03_pacote", "Chafariz clássico (pacote)", "chafariz", ["parque", "praca", "chafariz", "pacote"],
     lambda it: pp.p_fountain_pacote(it), {}),
    ("obelisco", "Obelisco", "obelisco", ["parque", "praca", "monumento"], lambda it: pp.p_obelisco(it), {}),
    ("arco_trelica", "Arco de treliça branco com roseira", "arco_trelica", ["parque", "praca", "jardim"],
     lambda it: pp.p_arco_trelica(it), {}),
    ("coreto", "Coreto", "coreto", ["parque", "praca", "coreto"], lambda it: pp.p_coreto(it), {}),
    ("banco_praca", "Banco de praça", "banco_praca", ["parque", "praca", "banco"], lambda it: pp.p_banco(it), {}),
    ("poste_praca_4_lanternas", "Poste de praça com 4 lanternas", "poste_praca", ["parque", "praca", "poste", "luz"],
     lambda it: pp.p_poste(it), {}),
]


def gera(saida, sel):
    global SAIDA
    SAIDA = saida
    import parque_areas_estampas as pe
    pasta_est = os.path.join(saida, CAT, "estampas")
    if not os.path.isdir(pasta_est) or len(os.listdir(pasta_est)) < 10:
        pe.desenha_tudo(pasta_est)
    pa.EST = estampa
    pp.EST = estampa
    cat = mb.Catalogo(CAT, saida, rotulo="Parque: áreas e caminhos")
    for id_, rot, grupo, tags, f, op in PECAS:
        if sel and id_ not in sel and grupo not in sel:
            continue
        mb.limpa()
        it = ItemP(id_)
        r = f(it) or {}
        op = dict(op, **r)
        plana = op.get("plana", grupo == "caminho_parque")
        col = op.get("col", col_laje() if plana else None)
        exporta(cat, it, rot, grupo, tags, mini=op.get("mini", cb.DIR_TOPO if plana else DIR_ALTO), col=col,
                extra=op.get("extra"), pacote=op.get("pacote", False))
    # ordem do catálogo = ordem de PECAS
    ordem = {p[0]: k for k, p in enumerate(PECAS)}
    cat.dados["itens"].sort(key=lambda e: ordem.get(e["id"], 999))
    cat.salva()


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    gera(args[0], args[1:])
