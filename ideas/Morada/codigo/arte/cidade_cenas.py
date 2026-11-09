"""Cenas de exemplo da biblioteca de cidade do Morada.

Um gerador de layout determinístico monta a cidade completa (~1.600 × 1.200 m) sobre a grade de 15 m, com as áreas
nos lugares da planta (Chinatown, centro, parque, praia com o parque de diversões e o píer, marina, bairro ecológico,
bairro futurista, observatório e represa), e cada cena de área é uma janela de 12 × 12 quadras dessa cidade (assim as
ruas casam nas bordas por construção). Tudo vem dos catálogos de SP/cidade_out (e dos bichos de SP/pets).

Etapas:
  layout    gera a cidade e as janelas, grava SP/cidade_out/cenas/<id>.json e roda o verificador;
  verifica  só o verificador, sobre os JSON gravados;
  monta     (Blender) importa cada GLB uma vez, monta as peças como instâncias de coleção, grava <id>.blend e os
            renders <id>_dia.png e <id>_noite.png (e as vistas da cidade completa).

Uso:
  python3 -I morada-art/cidade_cenas.py -- SP/cidade_out layout [ids...]
  python3 -I morada-art/cidade_cenas.py -- SP/cidade_out verifica [ids...]
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cidade_cenas.py -- SP/cidade_out monta <id> [dia|noite|blend]
       [--res 1600x1000] [--amostras 32] [--previa]

As medidas das peças (caixa envolvente local) vêm de SP/_cenas_tmp/medidas.json, feito por cidade_cenas_medidas.py.
"""
import glob
import json
import math
import os
import random
import sys
from collections import defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(AQUI)
Q, H = 15.0, 7.5
Z_ASF, Z_AGUA, Z_ELEV = -0.10, -1.0, 7.40
DIRS = {"N": (0, 1), "E": (1, 0), "S": (0, -1), "W": (-1, 0)}
OPP = {"N": "S", "S": "N", "E": "W", "W": "E"}
CCW = ["N", "W", "S", "E"]
RUA_MF, AV_MF = 3.75, 6.25


def rot_dir(d, r):
    return CCW[(CCW.index(d) + (int(r) // 90) % 4) % 4]


def facing_r(d):
    """Giro para a frente (−Y local) olhar para d."""
    return {"S": 0, "E": 90, "N": 180, "W": 270}[d]


def rp(x, y, r):
    a = math.radians(r)
    c, s = math.cos(a), math.sin(a)
    return x * c - y * s, x * s + y * c


def cc(i, j):
    """Centro da quadra (i, j)."""
    return Q * i + H, Q * j + H


def celula(x, y):
    return int(math.floor(x / Q)), int(math.floor(y / Q))


# ======================================================================================================================
# Catálogos e medidas
# ======================================================================================================================
class Biblioteca:
    def __init__(self, saida):
        self.saida = saida
        self.cat = {}
        for f in sorted(glob.glob(os.path.join(saida, "*", "catalogo.json"))):
            c = json.load(open(f))
            if c["categoria"] in ("teste_predios", "cenas"):
                continue
            for it in c["itens"]:
                self.cat[c["categoria"] + "/" + it["id"]] = it
        mf = os.path.join(SP, "_cenas_tmp", "medidas.json")
        self.med = json.load(open(mf)) if os.path.exists(mf) else {}
        self.bichos = {}
        for g in ("zoologico", "urbano", "estimacao"):
            jf = os.path.join(SP, "pets", g, g + ".json")
            if os.path.exists(jf):
                for b in json.load(open(jf))["bichos"]:
                    if os.path.exists(os.path.join(SP, "pets", g, "glb", b["id"] + ".glb")):
                        self.bichos[b["id"]] = dict(b, grupo=g)

    def tem(self, c, i):
        if c == "bichos":
            return i in self.bichos
        return (c + "/" + i) in self.cat

    def ids(self, c, filtro=None):
        out = []
        for k, it in self.cat.items():
            cc_, ii = k.split("/", 1)
            if cc_ == c and (filtro is None or filtro(ii, it)):
                out.append(ii)
        return sorted(out)

    def caixa(self, c, i):
        """(min, max) local em coordenadas do Blender."""
        if c == "bichos":
            b = self.bichos[i]
            m = b.get("medidas") or {}
            comp = b.get("comprimento_m") or m.get("comprimento", 1.0)
            alt = b.get("altura_m") or m.get("altura", 1.0)
            larg = m.get("largura", comp * 0.42)
            return [-larg / 2, -comp / 2, 0.0], [larg / 2, comp / 2, alt]
        m = self.med.get(c + "/" + i)
        if m:
            return m["min"], m["max"]
        d = self.cat[c + "/" + i]["dims"]
        return [-d[0] / 2, -d[1] / 2, 0.0], [d[0] / 2, d[1] / 2, d[2]]

    def tags(self, c, i):
        if c == "bichos":
            return ["bicho"]
        return self.cat[c + "/" + i].get("tags", [])


B = None  # Biblioteca global (carregada no main)


def cen_id(*nomes):
    """Id de uma peça do cenário: o nome exato ou o primeiro que contém o pedaço (None se não houver)."""
    for n in nomes:
        if B.tem("cenario", n):
            return n
    ids = B.ids("cenario")
    for n in nomes:
        for i in ids:
            if n in i:
                return i
    return None

# ----------------------------------------------------------------------------------------------- classes de peça
TILE_CATS = ("ruas", "pisos", "agua", "ferrovia")
ELEV_IDS = ("viaduto_rua", "viaduto_rua_vao", "viaduto_avenida", "ponte_tabuleiro_rua", "ponte_tabuleiro_avenida",
            "ponte_laco", "ponte_estaiada_v", "ponte_estaiada_agulha", "ponte_arco_tijolo", "ponte_passarela")
VEICULO_CATS = ("carros", "utilitarios")


def classe(c, i):
    """tile (chão, cobre quadras), elev (tabuleiro elevado sobre o chão), veiculo, barco, bicho, arvore, poste, objeto."""
    if c == "bichos":
        return "bicho"
    if i in ELEV_IDS:
        return "elev"
    if c in TILE_CATS or (c == "estacionamentos" and i != "edificio_garagem"):
        return "tile"
    if c == "cenario":
        tg = B.cat.get(c + "/" + i, {}).get("tags", [])
        if "represa" in tg:
            return "objeto"
        if "modular" in tg or "montanha" in tg or "morro" in tg or "pier" in tg:
            return "tile"
    lo, hi = B.caixa(c, i)
    lx, ly = hi[0] - lo[0], hi[1] - lo[1]
    if c in ("estruturas", "parque_areas", "parque_brinquedos", "pontes", "props_esporte", "props_praia", "props_rua",
             "props_lazer", "cenario") and lo[2] <= -0.3 and \
            abs(lx / Q - round(lx / Q)) < 0.02 and abs(ly / Q - round(ly / Q)) < 0.02 and round(lx / Q) >= 1:
        return "tile"
    if c in VEICULO_CATS:
        return "veiculo"
    if c == "barcos":
        return "barco"
    if c == "aeronaves":
        return "aereo"
    if c in ("vegetacao", "fantasia") and any(t in i for t in ("arvore", "palm", "pinheiro", "pine")):
        return "arvore"
    if i.startswith(("poste_rua", "traffic_light", "spotlight_01", "relogio_rua", "placa_")) or "placa" in i[:6]:
        return "poste"
    return "objeto"


def cobre(c, i, x, y, r):
    """Quadras cobertas por uma peça de chão (tile/elev)."""
    lo, hi = B.caixa(c, i)
    lx, ly = hi[0] - lo[0], hi[1] - lo[1]
    if int(round(r)) % 180 == 90:
        lx, ly = ly, lx
    nx, ny = max(1, int(round(lx / Q))), max(1, int(round(ly / Q)))
    i0 = int(round((x - nx * Q / 2) / Q))
    j0 = int(round((y - ny * Q / 2) / Q))
    return [(i0 + a, j0 + b) for a in range(nx) for b in range(ny)]


def _ret(x0, y0, x1, y1, x, y, r):
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    return [(x + px, y + py) for px, py in (rp(a, b, r) for a, b in pts)]


def volumes(p):
    """Volumes de colisão (polígono 2D, z0, z1) de uma peça que não é chão."""
    c, i = p["c"], p["i"]
    x, y, z = p["p"]
    r = p.get("r", 0)
    s = p.get("s", 1.0)
    lo, hi = B.caixa(c, i)
    lo = [v * s for v in lo]
    hi = [v * s for v in hi]
    k = classe(c, i)
    h = hi[2] - lo[2]
    if k == "arvore":
        t = 0.35 * s
        return [(_ret(-t, -t, t, t, x, y, r), z, z + 0.4 * h),
                (_ret(lo[0], lo[1], hi[0], hi[1], x, y, r), z + 0.4 * h, z + hi[2])]
    if k == "poste":
        t = 0.25
        out = [(_ret(-t, -t, t, t, x, y, r), z, z + hi[2])]
        if hi[2] > 4.5:
            out.append((_ret(lo[0], lo[1], hi[0], hi[1], x, y, r), z + hi[2] - 1.2, z + hi[2]))
        return out
    if k == "elev":
        return [(_ret(lo[0], lo[1], hi[0], hi[1], x, y, r), z + 6.0, z + 7.3)]
    if k in ("veiculo", "barco"):
        m = 0.05
        return [(_ret(lo[0] + m, lo[1] + m, hi[0] - m, hi[1] - m, x, y, r), z + max(lo[2], 0.0), z + hi[2])]
    return [(_ret(lo[0], lo[1], hi[0], hi[1], x, y, r), z + max(lo[2], 0.0), z + hi[2])]


# ----------------------------------------------------------------------------------------------- geometria 2D
def _proj(poly, ax):
    v = [px * ax[0] + py * ax[1] for px, py in poly]
    return min(v), max(v)


def sobrepoe(a, b, folga=0.02):
    for poly in (a, b):
        for k in range(len(poly)):
            x0, y0 = poly[k]
            x1, y1 = poly[(k + 1) % len(poly)]
            ax = (-(y1 - y0), x1 - x0)
            n = math.hypot(*ax) or 1.0
            ax = (ax[0] / n, ax[1] / n)
            a0, a1 = _proj(a, ax)
            b0, b1 = _proj(b, ax)
            if a1 <= b0 + folga or b1 <= a0 + folga:
                return False
    return True


def amostras(poly, passo=0.5):
    """Pontos de amostra dentro de um quadrilátero (convexo)."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = poly
    la = math.hypot(x1 - x0, y1 - y0)
    lb = math.hypot(x3 - x0, y3 - y0)
    na, nb = max(1, int(la / passo)), max(1, int(lb / passo))
    out = []
    for a in range(na + 1):
        for b in range(nb + 1):
            u, v = a / na, b / nb
            out.append((x0 + (x1 - x0) * u + (x3 - x0) * v, y0 + (y1 - y0) * u + (y3 - y0) * v))
    return out


def aabb(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


# ======================================================================================================================
# Superfície das peças de chão: o que há em (x, y) local de cada peça
# ======================================================================================================================
def _fillet(x, y, m, r):
    """Dentro do arredondamento de canto (asfalto) entre as guias x = m e y = m (quadrante +,+)."""
    return m <= x < m + r and m <= y < m + r and math.hypot(x - (m + r), y - (m + r)) > r


def superficie_local(i, x, y):
    """'asfalto', 'calcada', 'estacionamento', 'agua', 'muro', 'livre' (piso/grama) ou 'area' (sem objetos soltos)."""
    ax, ay = abs(x), abs(y)
    if i.startswith(("rua_reta", "rua_lombada", "rua_ponto_onibus", "road_009", "road_022")):
        return "asfalto" if ax < RUA_MF + 0.12 else "calcada"
    if i.startswith(("avenida_reta", "avenida_canteiro", "road_001", "road_020", "rua_transicao")):
        return "asfalto" if ax < AV_MF + 0.12 else "calcada"
    if i.startswith(("rua_cruzamento", "avenida_cruzamento")):
        if i.startswith("rua_"):
            mx = my = RUA_MF
            rr = 2.5
        elif i == "avenida_cruzamento_rua":
            mx, my, rr = AV_MF, RUA_MF, 1.0
        else:
            mx = my = AV_MF
            rr = 1.0
        t = "_t" in i
        if ax < mx + 0.12 and (not t or y < my + 0.12):
            return "asfalto"
        if ay < my + 0.12:
            return "asfalto"
        if (not t or y < 0) and ax >= mx and ay >= my and math.hypot(ax - (mx + rr), ay - (my + rr)) > rr and \
                ax < mx + rr and ay < my + rr:
            return "asfalto"
        return "calcada"
    if i in ("rua_curva", "avenida_curva"):
        m = RUA_MF if i == "rua_curva" else AV_MF
        d = math.hypot(x - H, y + H)
        return "asfalto" if H - m - 0.12 < d < H + m + 0.12 else "calcada"
    if i == "rua_fim":
        if y < 0.8 and ax < RUA_MF + 0.12:
            return "asfalto"
        return "asfalto" if math.hypot(x, y - 0.8) < 5.9 else "calcada"
    if i == "rotatoria_grande":
        if math.hypot(x, y) < 15.6 or ax < RUA_MF + 0.12 or ay < RUA_MF + 0.12:
            return "asfalto"
        return "calcada"
    if i.startswith("road_"):
        return "asfalto" if ax < AV_MF + 0.12 or ay < AV_MF + 0.12 else "calcada"
    if i.startswith(("estacionamento",)):
        return "estacionamento"
    if i.startswith("rampa_viaduto"):
        return "area"
    if i == "agua_aberta":
        return "agua"
    if i in ("orla", "cais"):
        if y > -1.8:
            return "agua"
        return "muro" if y > -2.6 else "calcada"
    if i.startswith(("piso_", "set_b_tiles")):
        return "livre"
    if i.startswith(("caminho_parque", "praca_redonda")):
        w = 1.6
        if i == "praca_redonda":
            return "caminho" if math.hypot(x, y) < 6.0 or ax < w or ay < w else "livre"
        if i == "caminho_parque_reta":
            return "caminho" if ax < w else "livre"
        if i == "caminho_parque_duplo":
            return "caminho" if abs(ax - 3.75) < w else "livre"
        if i == "caminho_parque_cruz":
            return "caminho" if ax < w or ay < w else "livre"
        if i == "caminho_parque_t":
            return "caminho" if ay < w or (ax < w and y < 0) else "livre"
        if i in ("caminho_parque_fim",):
            return "caminho" if (ax < w and y < 0.6) or math.hypot(x, y - 0.6) < 3.1 else "livre"
        if i in ("caminho_parque_curva", "caminho_parque_canto"):
            return "caminho" if abs(math.hypot(x - H, y + H) - H) < w + 0.6 else "livre"
        if i == "caminho_parque_rotatoria":
            return "caminho" if math.hypot(x, y) < 6.0 or ax < w or ay < w else "livre"
        return "livre"
    if i in ("areia",) or i.startswith(("grama_areia", "ciclovia", "laje_calcadao", "piso_areia")):
        return "livre"
    if i == "praca_cristal":
        return "area"
    if i.startswith(("costa_areia", "costa_rocha")):
        if i.endswith("reta"):
            sv = y
        elif i.endswith("faixa_base"):
            sv = min(y, 2 * abs(x) - H)
        elif i.endswith("faixa"):
            sv = 2 * abs(x) - H
        elif i.endswith("ponta"):
            sv = 2 * math.hypot(x, y + H) - H
        elif i.endswith("canto_ext"):
            sv = math.hypot(x + H, y + H) - H
        elif i.endswith("canto_int"):
            sv = H - math.hypot(x - H, y - H)
        else:
            return "costa"
        return "livre" if sv < -2.0 else ("agua" if sv > 1.0 else "costa")
    if i in ("mar", "mar_grande"):
        return "agua"
    return "area"


Z_PLATO = 3.75
Z_SOB_PLATO = -0.42   # plato_topo rebaixado debaixo de rua/praça apoiada no alto


def altura_local(i, x, y):
    """Altura do chão da peça em (x, y) local: o alto dos platôs fica em 3,75; o resto em 0."""
    if i == "plato_topo":
        return Z_PLATO
    if i == "plato_borda":
        return Z_PLATO if y > -0.3 else 0.0
    if i == "plato_canto_ext":
        return Z_PLATO if (x > -0.3 and y > -0.3) else 0.0
    if i == "plato_canto_int":
        return 0.0 if (x < -0.3 and y < -0.3) else Z_PLATO
    return 0.0


def superficie_plato(i, x, y):
    if i == "plato_topo":
        return "livre"
    if i == "plato_borda":
        return "livre" if (y > 0.4 or y < -1.0) else "muro"
    if i == "plato_canto_ext":
        if x > 0.4 and y > 0.4:
            return "livre"
        if x < -1.0 or y < -1.0:
            return "livre"
        return "muro"
    if i == "plato_canto_int":
        if x < -1.0 and y < -1.0:
            return "livre"
        if x > 0.4 or y > 0.4:
            return "livre"
        return "muro"
    return "area"


class Mapa:
    """Índice das peças de chão de uma cena: quadra → peça. 'chao' é o chão (z = 0), 'topo' o que está apoiado no alto
    de um platô (rua e praça em z = 3,75) e 'elev' os tabuleiros elevados."""

    def __init__(self, pecas):
        self.chao = {}
        self.topo = {}
        self.elev = {}
        self.dup = []
        self.pecas = pecas
        for n in range(len(pecas)):
            self.inclui(n)

    def inclui(self, n):
        p = self.pecas[n]
        k = classe(p["c"], p["i"])
        if k not in ("tile", "elev"):
            return
        alvo = self.elev if k == "elev" else (self.topo if p["p"][2] > 1.0 else self.chao)
        for q in cobre(p["c"], p["i"], p["p"][0], p["p"][1], p.get("r", 0)):
            if q in alvo:
                self.dup.append((q, alvo[q], n))
            alvo[q] = n

    def sup3(self, x, y):
        """(superfície, peça, altura do chão) em (x, y)."""
        q = celula(x, y)
        n = self.topo.get(q)
        if n is None:
            n = self.chao.get(q)
        if n is None:
            return None, None, 0.0
        p = self.pecas[n]
        lx, ly = rp(x - p["p"][0], y - p["p"][1], -p.get("r", 0))
        if p["i"].startswith("plato_"):
            return superficie_plato(p["i"], lx, ly), p, altura_local(p["i"], lx, ly)
        return superficie_local(p["i"], lx, ly), p, p["p"][2]

    def sup(self, x, y):
        s_, p, _ = self.sup3(x, y)
        return s_, p

    def tem_elev(self, x, y):
        return celula(x, y) in self.elev


# ======================================================================================================================
# Cena em construção
# ======================================================================================================================
class Cena:
    def __init__(self, semente):
        self.semente = semente
        self.pecas = []
        self.tipo = {}       # quadra → tipo do chão ('rua', 'lote', 'verde', 'agua', 'especial', ...)
        self.estilo = {}     # quadra → estilo do bairro
        self.idx = defaultdict(list)  # índice espacial dos volumes (grade de 5 m)
        self.uso = defaultdict(int)
        self.mapa = None
        self.lim = (Q * CIDADE_I[0], Q * CIDADE_I[1], Q * CIDADE_J[0], Q * CIDADE_J[1])

    def rnd(self, *tag):
        return random.Random("%s|%s" % (self.semente, "|".join(map(str, tag))))

    def add(self, c, i, x, y, z=0.0, r=0, **kw):
        if not B.tem(c, i):
            return None
        p = {"c": c, "i": i, "p": [round(x, 3), round(y, 3), round(z, 3)], "r": int(round(r)) % 360}
        p.update({k: v for k, v in kw.items() if v is not None})
        self.pecas.append(p)
        self.uso[(c, i)] += 1
        if classe(c, i) not in ("tile",):
            for v in volumes(p):
                self._indexa(v, len(self.pecas) - 1)
        if self.mapa is not None:
            self.mapa.inclui(len(self.pecas) - 1)
        return p

    def _indexa(self, v, n):
        x0, y0, x1, y1 = aabb(v[0])
        for a in range(int(math.floor(x0 / 5)), int(math.floor(x1 / 5)) + 1):
            for b in range(int(math.floor(y0 / 5)), int(math.floor(y1 / 5)) + 1):
                self.idx[(a, b)].append((v, n))

    def colide(self, p, ignora_veiculos=False):
        for v in volumes(p):
            x0, y0, x1, y1 = aabb(v[0])
            vistos = set()
            for a in range(int(math.floor(x0 / 5)), int(math.floor(x1 / 5)) + 1):
                for b in range(int(math.floor(y0 / 5)), int(math.floor(y1 / 5)) + 1):
                    for w, n in self.idx.get((a, b), ()):
                        if id(w) in vistos:
                            continue
                        vistos.add(id(w))
                        if ignora_veiculos and classe(self.pecas[n]["c"], self.pecas[n]["i"]) == "veiculo":
                            continue
                        if v[1] < w[2] - 0.01 and w[1] < v[2] - 0.01 and sobrepoe(v[0], w[0], folga=-0.04):
                            return True
        return False

    def tenta(self, c, i, x, y, z=0.0, r=0, chao=("calcada", "livre"), **kw):
        """Põe a peça só se ela couber: sem colidir e com o pé todo num chão permitido."""
        if not B.tem(c, i):
            return None
        p = {"c": c, "i": i, "p": [x, y, z], "r": r}
        p.update(kw)
        if self.mapa is None:
            self.mapa = Mapa(self.pecas)
        if self.lim:
            X0, X1, Y0, Y1 = self.lim
            for poly, z0, z1 in volumes(p):
                if any(not (X0 + 0.1 < a < X1 - 0.1 and Y0 + 0.1 < b < Y1 - 0.1) for a, b in poly):
                    return None
        if not pe_ok(self.mapa, p, chao):
            return None
        if self.colide(p):
            return None
        return self.add(c, i, x, y, z, r, **kw)

    def escolhe(self, rnd, opcoes):
        """Escolha ponderada favorecendo o que foi menos usado (variedade)."""
        ops = [(c, i, w) for c, i, w in opcoes if B.tem(c, i)]
        if not ops:
            return None
        pesos = [w / (1.0 + 0.6 * self.uso[(c, i)]) for c, i, w in ops]
        t = rnd.random() * sum(pesos)
        for (c, i, w), pw in zip(ops, pesos):
            t -= pw
            if t <= 0:
                return c, i
        return ops[-1][:2]


def pe_ok(mapa, p, chao):
    """Toda a base da peça (volumes com z0 perto do chão) sobre um chão do tipo permitido e sem tabuleiro em cima
    para peças altas."""
    for poly, z0, z1 in volumes(p):
        if z0 > p["p"][2] + 2.0:
            continue
        for x, y in amostras(poly, 0.6):
            s, _, h = mapa.sup3(x, y)
            if s not in chao:
                return False
            if p["c"] not in ("barcos",) and abs(h + (Z_ASF if s in ("asfalto", "estacionamento") and
                                                     classe(p["c"], p["i"]) == "veiculo" else 0.0) - p["p"][2]) > 0.05:
                return False
            if z1 > p["p"][2] + 5.9 and p["p"][2] < 3 and mapa.tem_elev(x, y):
                return False
    return True


# ======================================================================================================================
# Rede de ruas
# ======================================================================================================================
class Rede:
    def __init__(self):
        self.aresta = {}        # (q1, q2) ordenado → 'rua' | 'av'
        self.especial = set()   # quadras de rampa/viaduto (não são peça de rua)

    @staticmethod
    def _k(a, b):
        return (a, b) if a <= b else (b, a)

    def liga(self, a, b, prof="rua"):
        k = self._k(a, b)
        if self.aresta.get(k) != "av":
            self.aresta[k] = prof

    def segmento(self, a, b, prof="rua"):
        (i0, j0), (i1, j1) = a, b
        if i0 == i1:
            js = range(min(j0, j1), max(j0, j1))
            for j in js:
                self.liga((i0, j), (i0, j + 1), prof)
        else:
            for i in range(min(i0, i1), max(i0, i1)):
                self.liga((i, j0), (i + 1, j0), prof)

    def celulas(self):
        out = set()
        for a, b in self.aresta:
            out.add(a)
            out.add(b)
        return out - self.especial

    def bracos(self, q):
        out = {}
        for d, (dx, dy) in DIRS.items():
            v = self.aresta.get(self._k(q, (q[0] + dx, q[1] + dy)))
            if v:
                out[d] = v
        return out


def _gira_set(base, r):
    return {rot_dir(d, r): v for d, v in base.items()}


def _acha_r(base, bracos):
    for r in (0, 90, 180, 270):
        if _gira_set(base, r) == bracos:
            return r
    return None


def peca_rua(br):
    """(id, giro) da peça de rua para os braços dados, ou None se não houver peça."""
    n = len(br)
    profs = set(br.values())
    if n == 4:
        if profs == {"rua"}:
            return "rua_cruzamento_x", 0
        if profs == {"av"}:
            return "avenida_cruzamento_x", 0
        if br["N"] == br["S"] == "av" and br["E"] == br["W"] == "rua":
            return "avenida_cruzamento_rua", 0
        if br["N"] == br["S"] == "rua" and br["E"] == br["W"] == "av":
            return "avenida_cruzamento_rua", 90
        return None
    if n == 3 and len(profs) == 1:
        pr = profs.pop()
        r = _acha_r({"E": pr, "S": pr, "W": pr}, br)
        return ("rua_cruzamento_t" if pr == "rua" else "avenida_cruzamento_t"), r
    if n == 2:
        ds = sorted(br)
        if ds in (["N", "S"], ["E", "W"]):
            if len(profs) == 1:
                pr = profs.pop()
                return ("rua_reta" if pr == "rua" else "avenida_reta"), (0 if ds == ["N", "S"] else 90)
            r = _acha_r({"S": "rua", "N": "av"}, br)
            return "rua_transicao_avenida", r
        if len(profs) == 1:
            pr = profs.pop()
            r = _acha_r({"S": pr, "E": pr}, br)
            return ("rua_curva" if pr == "rua" else "avenida_curva"), r
        return None
    if n == 1 and profs == {"rua"}:
        return "rua_fim", _acha_r({"S": "rua"}, br)
    return None


def resolve_rede(rede):
    """Promove a avenida os cruzamentos sem peça (a rua que chega vira transição na quadra vizinha)."""
    for _ in range(50):
        mudou = False
        for q in sorted(rede.celulas()):
            br = rede.bracos(q)
            if peca_rua(br) is None:
                if len(br) == 1:
                    for d in br:
                        rede.aresta[rede._k(q, (q[0] + DIRS[d][0], q[1] + DIRS[d][1]))] = "rua"
                else:
                    for d in br:
                        rede.aresta[rede._k(q, (q[0] + DIRS[d][0], q[1] + DIRS[d][1]))] = "av"
                mudou = True
        if not mudou:
            return
    raise RuntimeError("rede sem solução")


# ======================================================================================================================
# Listas de peças por estilo
# ======================================================================================================================
def predios(cat, excluir=()):
    return [(cat, i, 1.0) for i in B.ids(cat) if i not in excluir]


ARVORES_RUA = [("vegetacao", "arvore_redonda_pequena", 1.0), ("vegetacao", "arvore_oval_alta", 1.0),
               ("vegetacao", "arvore_conica", 0.6), ("vegetacao", "arvore_redonda_media", 0.8),
               ("vegetacao", "arvore_florida_rosa", 0.4)]
ARVORES_PARQUE = [("vegetacao", "arvore_redonda_media", 1.2), ("vegetacao", "arvore_redonda_grande", 0.7),
                  ("vegetacao", "arvore_redonda_pequena", 1.0), ("vegetacao", "arvore_florida_rosa", 0.6),
                  ("vegetacao", "arvore_oval_alta", 0.7), ("vegetacao", "arvore_conica", 0.5),
                  ("vegetacao", "pinheiro", 0.3), ("vegetacao", "arvore_outono", 0.3)]
ARBUSTOS = [("vegetacao", "arbusto_redondo", 1.0), ("vegetacao", "topiaria_bolas", 0.3),
            ("vegetacao", "floreira_redonda", 0.5), ("vegetacao", "touceira_grama", 0.5),
            ("vegetacao", "canteiro_flores", 0.5)]
CARROS_COMUNS = [("carros", i, 1.0) for i in (
    "sedan_azul", "sedan_vermelho", "taxi", "compacto_amarelo", "compacto_cinza", "suv_roxo", "jipe_verde",
    "cupe_verde_agua", "cupe_verde_limao", "carrinho_redondo_laranja", "carrinho_redondo_cinza_listrado",
    "minivan_roxa_6_rodas", "picape_vermelha", "sedan_luxo_preto", "sedan_luxo_branco", "esportivo_aerofolio_laranja",
    "esportivo_conversivel_vermelho", "carro_antigo_listrado_azul", "picape_verde_motor")] + \
    [("utilitarios", i, 0.5) for i in ("kombi_viagem", "kombi_rosa", "furgao_cinza", "onibus_urbano",
                                        "caminhao_bau", "carro_rabo_de_peixe_rosa", "carro_antigo_laranja",
                                        "carro_antigo_preto", "onibus_rosa_creme", "caminhao_lixo")]
CARROS_FUTURO = [("carros", i, 2.0) for i in ("futurista_sedan_branco", "futurista_bolha_branco",
                                              "futurista_hiper_branco")] + CARROS_COMUNS[:8]
CARROS_PRAIA = [("utilitarios", "kombi_viagem", 1.5), ("utilitarios", "kombi_rosa", 1.5),
                ("utilitarios", "food_truck_sorvete", 1.0), ("carros", "bugue_laranja", 1.0),
                ("utilitarios", "onibus_turismo_azul", 0.6)] + CARROS_COMUNS[:10]

ESTILO = {
    "china": dict(predios=lambda: predios("predios_chinatown", ("portal_decorado",)), piso=["piso_calcada_lisa",
                  "piso_ladrilho_rosado"], arvores=ARVORES_RUA, carros=CARROS_COMUNS, grande=0.35),
    "regular": dict(predios=lambda: predios("predios_regulares"), piso=["piso_calcada_lisa"], arvores=ARVORES_RUA,
                    carros=CARROS_COMUNS, grande=0.3),
    "centro": dict(predios=lambda: predios("predios_regulares") + [(c, i, 0.0) for c, i, _ in
                                                                  predios("arranha_ceus")],
                   piso=["piso_calcada_lisa", "set_b_tiles_09_pacote"], arvores=ARVORES_RUA, carros=CARROS_COMUNS,
                   grande=0.3),
    "eco": dict(predios=lambda: predios("predios_ecologicos"), piso=["piso_grama"], arvores=ARVORES_PARQUE,
                carros=CARROS_COMUNS, grande=0.35),
    "futurista": dict(predios=lambda: predios("predios_futuristas") + [("arranha_ceus", "arranha_ceu_arcos_brancos",
                                                                         0.5)],
                      piso=["piso_calcada_lisa", "set_b_tiles_09_pacote"], arvores=[("vegetacao", "palmeira", 1.0),
                                                                                    ("vegetacao", "arvore_oval_alta",
                                                                                     0.5)],
                      carros=CARROS_FUTURO, grande=0.35),
    "tropical": dict(predios=lambda: predios("predios_tropicais"), piso=["piso_calcada_lisa"],
                     arvores=[("vegetacao", "palmeira", 1.0)], carros=CARROS_PRAIA, grande=0.4),
    "magico": dict(predios=lambda: predios("predios_magicos", ("cristais_roxos", "castelo_areia", "castelo_rosa",
                                                               "casa_arvore")),
                   piso=["piso_grama"], arvores=ARVORES_PARQUE, carros=CARROS_COMUNS, grande=0.0),
}


# ======================================================================================================================
# Cidade
# ======================================================================================================================
class Distrito:
    def __init__(self, nome, estilo, i0, i1, j0, j1, vx=None, hy=None, ilha="central"):
        self.nome, self.estilo = nome, estilo
        self.i0, self.i1, self.j0, self.j1 = i0, i1, j0, j1
        self.vx = vx if vx is not None else [i0, i1]
        self.hy = hy if hy is not None else [j0, j1]
        self.ilha = ilha

    def dentro(self, q):
        return self.i0 < q[0] < self.i1 and self.j0 < q[1] < self.j1


# linhas e distritos (índices de quadra; a rua de borda fica na linha i0/i1/j0/j1)
HY_NORTE = [1, 4, 7, 11, 14, 17, 20]
HY_SUL = [-12, -9, -6, -3, 1]
DISTRITOS = [
    Distrito("chinatown_plato", "china", -25, -18, 2, 9, vx=[-25, -18], hy=[2, 9]),
    Distrito("chinatown_oeste", "china", -25, -18, 9, 20, vx=[-25, -22, -18], hy=[9, 12, 15, 17, 20]),
    Distrito("chinatown", "china", -18, -9, 2, 20, vx=[-18, -15, -12, -9], hy=[2, 5, 8, 11, 14, 17, 20]),
    Distrito("centro", "centro", -9, 9, 1, 20, vx=[-9, -6, -3, 0, 3, 6, 9], hy=HY_NORTE),
    Distrito("leste", "regular", 9, 21, -12, 20, vx=[9, 12, 15, 18, 21], hy=HY_SUL + [4, 7, 11, 14, 17, 20]),
    Distrito("sudoeste", "regular", -15, -8, -12, 1, vx=[-15, -12, -8], hy=HY_SUL),
    Distrito("parque", "parque", -8, 3, -9, 1, vx=[-8, 3], hy=[-9, 1]),
    Distrito("sul", "regular", -8, 3, -12, -9, vx=[-8, -5, -1, 3], hy=[-12, -9]),
    Distrito("meio", "regular", 3, 9, -12, 1, vx=[3, 6, 9], hy=HY_SUL),
    Distrito("orla_hoteis", "tropical", -3, 21, -15, -12, vx=[-3, 0, 3, 6, 9, 12, 15, 18, 21], hy=[-15, -12]),
    Distrito("diversoes", "diversoes", 0, 12, -23, -15, vx=[0, 12], hy=[-23, -15]),
    Distrito("futurista", "futurista", -50, -26, -19, -6, vx=[-50, -47, -44, -41, -38, -35, -32, -29, -26],
             hy=[-19, -16, -13, -10, -6], ilha="futurista"),
    Distrito("ecologico", "eco", 31, 51, -8, 14, vx=[31, 34, 37, 40, 43, 46, 49, 51], hy=[-8, -5, -2, 1, 4, 8, 11, 14],
             ilha="eco"),
    Distrito("observatorio", "observatorio", -6, 4, 30, 33, vx=[-6, 4], hy=[30, 33], ilha="observatorio"),
]
AVENIDAS = [((-15, 11), (21, 11)), ((3, -15), (3, 20))]
# pontes: (quadra do cruzamento na margem A, direção, nº quadras de ponte, peça da ponte)
PONTES = [((-26, -10), "E", "ponte_estaiada_v"), ((21, 8), "E", "ponte_laco"), ((0, 20), "N", "ponte_estaiada_agulha")]
# linhas elevadas (quadras de rua nas pontas) e a linha de rua abaixo por onde os carros voltam (laço na mão)
VIADUTOS = [((-25, 10), (-18, 10), 9), ((-18, 13), (-9, 13), 11), ((-6, 12), (0, 12), 11), ((0, 12), (9, 12), 11)]
PLATO_CRISTAL = (-24, -19, 3, 8)        # moldura do platô (6 × 6); anel de rua no alto e rampa ao norte
RAMPA_PLATO = (-21, 8)                  # rampa do platô (sobe para o sul) ligada à rua j = 9
CALCADAO = [(i, j) for i in range(-25, -15) for j in (0, 1)]   # ciclovia (j = 1) e laje do calçadão (j = 0)
TERRACOS = [(35, 36, 5, 7), (44, 45, -1, 0), (41, 42, 9, 10), (38, 39, 12, 13)]   # platôs do bairro ecológico
# túneis: (quadra de rua, direção para dentro da montanha); a montanha com túnel (3 × 2) fica com a boca nessa rua
TUNEIS = [((37, 14), "N"), ((-32, -19), "S"), ((-6, 30), "W")]
# serras: terra de grama com montanhas (i0, i1, j0, j1)
SERRAS = [(29, 52, 15, 39), (49, 52, -12, 14), (-53, -24, -40, -21), (-53, -51, -24, -4), (-53, -33, 22, 39),
          (-9, -8, 32, 35)]
SERRAS = [r_ for r_ in SERRAS if r_ != (-53, -33, 22, 39)]
REPRESA = (-610.0, 470.0, -35.0)   # centro da crista e giro (a água do reservatório fica para +Y local)
# janelas das cenas de área (i0, j0) com 12 × 12 quadras
JANELAS = {
    "chinatown": ("Chinatown", (-26, 0)),
    "centro": ("Bairro regular e centro", (-6, 6)),
    "parque": ("Parque", (-8, -10)),
    "praia": ("Praia e parque de diversões", (1, -32)),
    "marina": ("Marina", (-16, -21)),
    "ecologico": ("Bairro ecológico", (29, 5)),
    "futurista": ("Bairro futurista", (-35, -21)),
    "observatorio_represa": ("Observatório e represa", (-8, 27)),
}
TAM_JANELA = 12
CIDADE_I = (-53, 53)
CIDADE_J = (-40, 40)

# zonas verdes extras (dentro da ilha, fora dos distritos) e retângulos de areia
ZONAS_VERDES = [("vila_magica", -32, -26, 3, 17)]
AREIA_RETS = [(-3, 24, -26, -14)]
MARINA_AGUA = (-14, -5, -28, -14)
PRAIA_FIXOS = {(10, -25): ("props_praia", "castelo_areia_gigante", 0),
               (3, -24): ("props_praia", "quiosque_sucos_coco_gigante", 0),
               (12, -24): ("props_praia", "rede_volei_praia", 0),
               (4, -25): ("props_praia", "posto_salva_vidas_amarelo", 180),
               (9, -24): ("utilitarios", "food_truck_sorvete", 90),
               (1, -24): ("utilitarios", "kombi_viagem", 30),
               (11, -25): ("props_praia", "quiosque_coco_palha", 0),
               (2, -25): ("carros", "bugue_laranja", 300)}   # i0, i1, j0, j1 (inclusive)
CORNERS = ("SW", "SE", "NE", "NW")
CORNER_PT = {"SW": (-1, -1), "SE": (1, -1), "NE": (1, 1), "NW": (-1, 1)}


def rot_corner(cn, r):
    k = (int(r) // 90) % 4
    return CORNERS[(CORNERS.index(cn) + k) % 4]


def ret_set(i0, i1, j0, j1):
    return {(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1)}


def dilata(s, n=1):
    out = set(s)
    for _ in range(n):
        novo = set(out)
        for (i, j) in out:
            for a in (-1, 0, 1):
                for b in (-1, 0, 1):
                    novo.add((i + a, j + b))
        out = novo
    return out


class Cidade:
    def __init__(self, semente=11):
        self.c = Cena(semente)
        self.rede = Rede()
        self.tipo = {}          # quadra → 'rua' | 'esp' | 'lote' | 'verde' | 'areia' | 'mar' | 'orla' | 'agua'
        self.estilo = {}
        self.dist_de = {}
        self.rotas = []

    # ------------------------------------------------------------------------------------------ máscaras de terreno
    def mascaras(self):
        urb = set()
        for d in DISTRITOS:
            s = ret_set(d.i0, d.i1, d.j0, d.j1)
            urb |= s
            for q in s:
                self.dist_de[q] = d
        for nome, i0, i1, j0, j1 in ZONAS_VERDES:
            for q in ret_set(i0, i1, j0, j1):
                urb.add(q)
                self.estilo.setdefault(q, {"vila_magica": "magico"}.get(nome, nome))
        urb |= set(CALCADAO)
        self.urb = urb
        G = dilata(urb, 1)
        self.serra = set()
        for r_ in SERRAS:
            self.serra |= ret_set(*r_)
        G |= self.serra
        for q, d in TUNEIS:
            G |= set(self.cel_tunel(q, d))
        for (a, sentido, ponte) in PONTES:
            cel = self.cel_ponte(a, sentido, ponte)
            G |= set(cel["rampa1"] + cel["rampa2"])
        L = self.costa_organica(G)
        mi0, mi1, mj0, mj1 = MARINA_AGUA
        self.marina_agua = ret_set(mi0, mi1, mj0, mj1)
        self.marina_orla = {}
        for i in range(mi0 - 1, mi1 + 2):
            self.marina_orla[(i, mj1 + 1)] = "S"   # água ao sul
        for j in range(mj0, mj1 + 1):
            self.marina_orla[(mi0 - 1, j)] = "E"
            self.marina_orla[(mi1 + 1, j)] = "W"
        for (a, sentido, ponte) in PONTES:
            cel = self.cel_ponte(a, sentido, ponte)
            for q in cel["ponte"]:
                L.discard(q)
                G.discard(q)
        L -= self.marina_agua
        G -= self.marina_agua
        G |= set(self.marina_orla)
        L |= G
        self.G, self.L = G, L

    def costa_organica(self, G):
        """Terra (areia) em volta da terra firme com largura variável (ruído suave de 1 a 6 quadras), trechos de costa
        de rocha junto das serras, sem lagoas soltas nem pontas de uma quadra; o mar fica livre sob as pontes, na
        frente do píer e na marina."""
        rnd = random.Random("%s|costa" % self.c.semente)
        i0, i1 = CIDADE_I
        j0, j1 = CIDADE_J
        P = 6
        rede = {(a, b): rnd.random() for a in range(i0 // P - 2, i1 // P + 3) for b in range(j0 // P - 2, j1 // P + 3)}

        def ruido(i, j):
            fa, fb = i / P, j / P
            a, b = math.floor(fa), math.floor(fb)
            u, v = fa - a, fb - b
            u, v = u * u * (3 - 2 * u), v * v * (3 - 2 * v)
            return (rede[(a, b)] * (1 - u) * (1 - v) + rede[(a + 1, b)] * u * (1 - v) + rede[(a, b + 1)] * (1 - u) * v +
                    rede[(a + 1, b + 1)] * u * v)

        def distancia(fonte, lim=8):
            d = {q: 0 for q in fonte}
            borda = list(fonte)
            for k in range(1, lim + 1):
                nova = []
                for (i, j) in borda:
                    for a in (-1, 0, 1):
                        for b in (-1, 0, 1):
                            v = (i + a, j + b)
                            if v not in d and i0 <= v[0] < i1 and j0 <= v[1] < j1:
                                d[v] = k
                                nova.append(v)
                borda = nova
            return d

        dg = distancia(G)
        ds = distancia(self.serra)
        L = set(G)
        for q, k in dg.items():
            if k == 0:
                continue
            f = ruido(*q)
            if q in ds and ds[q] <= k and f < 0.33:
                continue                      # costa de rocha: a serra encosta direto no mar
            if k <= 1 + int(f * 5.5):
                L.add(q)
        for r in AREIA_RETS:
            L |= ret_set(*r)
        # mar obrigatório: sob as pontes (com uma quadra de folga dos lados), na frente do píer e na marina
        mar = set()
        for (a, sentido, ponte) in PONTES:
            cel = self.cel_ponte(a, sentido, ponte)
            dx, dy = DIRS[sentido]
            for q in cel["ponte"]:
                for k in (-1, 0, 1):
                    mar.add((q[0] + dy * k, q[1] + dx * k))
        jc = AREIA_RETS[0][2]
        mar |= {(i, j) for i in range(3, 11) for j in range(j0, jc)}
        mi0, mi1, mj0, mj1 = MARINA_AGUA
        mar |= ret_set(mi0, mi1, mj0, mj1)
        rx, ry, _g = REPRESA          # a represa grande fica no mar, com folga
        mar |= {(i, j) for i in range(i0, i1) for j in range(j0, j1)
                if math.hypot(Q * i + H - rx, Q * j + H - (ry - 40)) < 185}
        L -= mar - G
        fixos = set(G) | {q for r in AREIA_RETS for q in ret_set(*r)}
        for _ in range(3):
            # tira pontas soltas (terra com 0 ou 1 vizinho de terra)
            for q in sorted(L - fixos):
                n = sum((q[0] + dx, q[1] + dy) in L for dx, dy in DIRS.values())
                if n <= 1:
                    L.discard(q)
            # enche lagoas fechadas (mar que não chega à borda do mapa)
            fora = set()
            pilha = [(i, j) for i in range(i0, i1) for j in (j0, j1 - 1)] + [(i, j) for j in range(j0, j1)
                                                                            for i in (i0, i1 - 1)]
            pilha = [q for q in pilha if q not in L]
            fora |= set(pilha)
            while pilha:
                q = pilha.pop()
                for dx, dy in DIRS.values():
                    v = (q[0] + dx, q[1] + dy)
                    if i0 <= v[0] < i1 and j0 <= v[1] < j1 and v not in L and v not in fora:
                        fora.add(v)
                        pilha.append(v)
            for i in range(i0, i1):
                for j in range(j0, j1):
                    if (i, j) not in L and (i, j) not in fora and (i, j) not in mar:
                        L.add((i, j))
        self.mar_fixo = mar
        return L

    def estado_corner(self, ci, cj):
        cels = [(ci - 1, cj - 1), (ci, cj - 1), (ci - 1, cj), (ci, cj)]
        if any(q not in self.L for q in cels):
            return "M"
        if any(q not in self.G for q in cels):
            return "A"
        return "G"

    def cel_tunel(self, q, d):
        f = DIRS[d]
        u = (-f[1], f[0])
        return [(q[0] + f[0] * m + u[0] * k, q[1] + f[1] * m + u[1] * k) for m in (1, 2) for k in (-1, 0, 1)]

    def cel_ponte(self, a, sentido, ponte):
        dx, dy = DIRS[sentido]
        n = int(round((B.caixa("pontes", ponte)[1][1] * 2) / Q)) if B.tem("pontes", ponte) else 5
        cel = [(a[0] + dx * k, a[1] + dy * k) for k in range(1, n + 5)]
        return {"rampa1": cel[0:2], "ponte": cel[2:2 + n], "rampa2": cel[2 + n:4 + n], "n": n}

    # ------------------------------------------------------------------------------------------ rede de ruas
    def rede_ruas(self):
        rd = self.rede
        for d in DISTRITOS:
            if d.estilo in ("observatorio",):
                rd.segmento((d.i0, d.j0), (d.i1, d.j0))
                continue
            for x in d.vx:
                rd.segmento((x, d.j0), (x, d.j1))
            for y in d.hy:
                rd.segmento((d.i0, y), (d.i1, y))
        for a, b in AVENIDAS:
            rd.segmento(a, b, "av")
        # pontes: rampas + ponte (quadras especiais) ligando os cruzamentos das margens
        for (a, sentido, ponte) in PONTES:
            cel = self.cel_ponte(a, sentido, ponte)
            fim = (a[0] + DIRS[sentido][0] * (cel["n"] + 5), a[1] + DIRS[sentido][1] * (cel["n"] + 5))
            rd.liga(a, cel["rampa1"][0])
            rd.liga(cel["rampa2"][-1], fim)
            for q in cel["rampa1"] + cel["ponte"] + cel["rampa2"]:
                rd.especial.add(q)
                self.tipo[q] = "esp"
            self.sob_ponte = getattr(self, "sob_ponte", set()) | set(cel["ponte"])
            self.pontes_cel = getattr(self, "pontes_cel", []) + [(a, sentido, ponte, cel, fim)]
        # túneis: a rua entra na boca da montanha (quadra do meio da frente)
        for q, d in TUNEIS:
            cels = self.cel_tunel(q, d)
            if not B.tem("cenario", "montanha_tunel"):
                continue
            rd.liga(q, cels[1])
            for v in cels:
                rd.especial.add(v)
                self.tipo[v] = "esp"
        # viadutos: rampa (2) + tabuleiro + rampa (2), sobre a linha de lotes; as pontas ligam nas ruas de borda
        self.viadutos_cel = []
        # rampa do platô da praça do cristal: liga o anel de rua do alto à rua de baixo
        if B.tem("cenario", "plato_rampa_rua"):
            q = RAMPA_PLATO
            rd.liga(q, (q[0], q[1] + 1))
            rd.especial.add(q)
            self.tipo[q] = "esp"
        for a, b, _js in VIADUTOS:
            (i0, j), (i1, _) = a, b
            cels = [(i, j) for i in range(i0 + 1, i1)]
            rd.liga((i0, j), cels[0])
            rd.liga(cels[-1], (i1, j))
            for q in cels[:2] + cels[-2:]:
                rd.especial.add(q)
                self.tipo[q] = "esp"
            self.viadutos_cel.append(cels)
        resolve_rede(rd)
        for q in rd.celulas():
            self.tipo[q] = "rua"

    # ------------------------------------------------------------------------------------------ peças de rua
    def pecas_rua(self):
        c = self.c
        for q in sorted(self.rede.celulas()):
            br = self.rede.bracos(q)
            i_, r = peca_rua(br)
            x, y = cc(*q)
            rnd = c.rnd("rua", q)
            est = self.estilo_de(q)
            if i_ == "rua_reta":
                viz_cruz = any(len(self.rede.bracos((q[0] + DIRS[d][0], q[1] + DIRS[d][1]))) >= 3 for d in br)
                u = rnd.random()
                if viz_cruz and u < 0.35:
                    i_ = "rua_reta_faixa_pedestres"
                elif u < 0.05:
                    i_ = "rua_lombada"
            elif i_ == "avenida_reta":
                viz_cruz = any(len(self.rede.bracos((q[0] + DIRS[d][0], q[1] + DIRS[d][1]))) >= 3 for d in br)
                if viz_cruz and rnd.random() < 0.4:
                    i_ = "avenida_reta_faixa_pedestres"
            elif i_ == "rua_cruzamento_x" and est in ("china", "centro", "futurista", "regular", "tropical") and \
                    rnd.random() < 0.6:
                i_ = "rua_cruzamento_x_faixas"
            elif i_ == "rua_cruzamento_t" and rnd.random() < 0.4:
                i_ = "rua_cruzamento_t_faixas"
            c.add("ruas", i_, x, y, 0, r)
            self.rua_peca = getattr(self, "rua_peca", {})
            self.rua_peca[q] = (i_, r)
        # avenidas com canteiro central nos trechos retos longos
        self._canteiros()
        # pontes e rampas
        for (a, sentido, ponte, cel, fim) in self.pontes_cel:
            rr = {"N": 0, "E": 270, "S": 180, "W": 90}[sentido]   # giro para a peça (eixo Y) seguir o sentido
            r1 = cel["rampa1"]
            x1 = (cc(*r1[0])[0] + cc(*r1[1])[0]) / 2
            y1 = (cc(*r1[0])[1] + cc(*r1[1])[1]) / 2
            c.add("estruturas", "rampa_viaduto_rua", x1, y1, 0, rr)
            pc = cel["ponte"]
            xp = sum(cc(*q)[0] for q in pc) / len(pc)
            yp = sum(cc(*q)[1] for q in pc) / len(pc)
            c.add("pontes", ponte, xp, yp, 0, rr)
            r2 = cel["rampa2"]
            x2 = (cc(*r2[0])[0] + cc(*r2[1])[0]) / 2
            y2 = (cc(*r2[0])[1] + cc(*r2[1])[1]) / 2
            c.add("estruturas", "rampa_viaduto_rua", x2, y2, 0, rr + 180)
        for q, d in TUNEIS:
            if B.tem("cenario", "montanha_tunel"):
                cels = self.cel_tunel(q, d)
                cx, cy = self.centro_de(cels)
                c.add("cenario", "montanha_tunel", cx, cy, 0, facing_r(OPP[d]))
        for cels in self.viadutos_cel:
            # rampa oeste sobe para leste (giro −90), rampa leste sobe para oeste (giro 90)
            for par, g in ((cels[:2], 270), (cels[-2:], 90)):
                x = (cc(*par[0])[0] + cc(*par[1])[0]) / 2
                c.add("estruturas", "rampa_viaduto_rua", x, cc(*par[0])[1], 0, g)
            for q in cels[2:-2]:
                if self.tipo.get(q) != "rua":
                    self.tipo[q] = "viaduto"
                self.elevado = getattr(self, "elevado", set()) | {q}

    def _canteiros(self):
        c = self.c
        vistos = set()
        for q, (i_, r) in sorted(self.rua_peca.items()):
            if i_ not in ("avenida_reta",) or q in vistos:
                continue
            eixo = "NS" if r % 180 == 0 else "EW"
            d1, d2 = ("S", "N") if eixo == "NS" else ("W", "E")
            # anda até o começo do trecho
            a = q
            while self.rua_peca.get((a[0] + DIRS[d1][0], a[1] + DIRS[d1][1]), ("",))[0] == "avenida_reta":
                a = (a[0] + DIRS[d1][0], a[1] + DIRS[d1][1])
            trecho = [a]
            while self.rua_peca.get((trecho[-1][0] + DIRS[d2][0], trecho[-1][1] + DIRS[d2][1]), ("",))[0] == \
                    "avenida_reta":
                trecho.append((trecho[-1][0] + DIRS[d2][0], trecho[-1][1] + DIRS[d2][1]))
            vistos |= set(trecho)
            if len(trecho) < 4:
                continue
            for k, t in enumerate(trecho):
                if k == 0:
                    novo, g = "avenida_canteiro_inicio", facing_r(d1)
                elif k == len(trecho) - 1:
                    novo, g = "avenida_canteiro_inicio", facing_r(d2)
                else:
                    novo, g = "avenida_canteiro", r
                for p in c.pecas:
                    if p["c"] == "ruas" and p["p"][0] == cc(*t)[0] and p["p"][1] == cc(*t)[1]:
                        p["i"], p["r"] = novo, g % 360
                self.rua_peca[t] = (novo, g % 360)

    def estilo_de(self, q):
        if q in self.estilo:
            return self.estilo[q]
        d = self.dist_de.get(q)
        return d.estilo if d else "verde"

    # ------------------------------------------------------------------------------------------ terreno
    def tile_terreno(self, q):
        """(categoria, id, giro, tipo) da quadra de terreno pelos estados dos 4 cantos."""
        i, j = q
        st = {"SW": self.estado_corner(i, j), "SE": self.estado_corner(i + 1, j),
              "NE": self.estado_corner(i + 1, j + 1), "NW": self.estado_corner(i, j + 1)}
        v = set(st.values())
        if v == {"G"}:
            return ("pisos", "piso_grama", 0, "verde")
        if v == {"A"}:
            return ("cenario", "areia", 0, "areia") if B.tem("cenario", "areia") else ("pisos", "piso_terra", 0, "areia")
        if v == {"M"}:
            return ("cenario", "mar", 0, "mar") if B.tem("cenario", "mar") else ("agua", "agua_aberta", 0, "mar")
        if "M" in v:
            terra = {k for k, e in st.items() if e != "M"}
            pref = "costa_rocha" if "A" not in v and B.tem("cenario", "costa_rocha_reta") else "costa_areia"
        else:
            terra = {k for k, e in st.items() if e == "G"}
            pref = "grama_areia"
        if len(terra) == 2 and terra in ({"SW", "NE"}, {"SE", "NW"}):
            terra = set(CORNERS) - {sorted(set(CORNERS) - terra)[0]}
        base = {1: ("canto_ext", {"SW"}), 2: ("reta", {"SW", "SE"}), 3: ("canto_int", {"SW", "SE", "NW"})}[len(terra)]
        for r in (0, 90, 180, 270):
            if {rot_corner(cn, r) for cn in base[1]} == terra:
                break
        id_ = pref + "_" + base[0]
        tipo = "areia" if pref == "grama_areia" else "costa"
        if pref == "costa_rocha" and base[0] == "canto_int":
            pass
        if B.tem("cenario", id_):
            return ("cenario", id_, r, tipo)
        if pref == "grama_areia":
            return ("pisos", "piso_grama", 0, "verde")
        return ("agua", "agua_aberta", 0, "mar") if len(terra) <= 1 else ("pisos", "piso_terra", 0, "areia")

    def terreno(self):
        c = self.c
        i0, i1 = CIDADE_I
        j0, j1 = CIDADE_J
        mar = set()
        tt = {}
        for i in range(i0, i1):
            for j in range(j0, j1):
                q = (i, j)
                if (q in self.tipo or q in self.urb) and q not in self.sob_ponte:
                    continue
                x, y = cc(i, j)
                if q in self.marina_agua:
                    self.tipo[q] = "agua"
                    if B.tem("cenario", "mar"):
                        c.add("cenario", "mar", x, y, 0, 0)
                    else:
                        c.add("agua", "agua_aberta", x, y, 0, 0)
                    continue
                if q in self.marina_orla:
                    self.tipo[q] = "orla"
                    continue  # orla/cais: na marina
                tt[q] = self.tile_terreno(q)
        self.espetos(tt)
        for q, (cat, id_, r, tipo) in sorted(tt.items()):
            if q not in self.sob_ponte:
                self.tipo[q] = tipo
            if tipo == "mar" and cat == "cenario":
                mar.add(q)
                continue
            c.add(cat, id_, *cc(*q), 0, r)
        # mar em blocos 4 × 4 quando dá
        usados = set()
        tem_grande = B.tem("cenario", "mar_grande")
        for q in sorted(mar):
            if q in usados:
                continue
            i, j = q
            if tem_grande and i % 4 == 0 and j % 4 == 0 and all((i + a, j + b) in mar for a in range(4) for b in range(4)):
                c.add("cenario", "mar_grande", Q * i + 2 * Q, Q * j + 2 * Q, 0, 0)
                usados |= {(i + a, j + b) for a in range(4) for b in range(4)}
        for q in sorted(mar - usados):
            c.add("cenario", "mar", *cc(*q), 0, 0)

    def espetos(self, tt):
        """Pontais de areia: numa costa reta de areia, a peça de começo de faixa, uma ou duas faixas e a ponta."""
        if not all(B.tem("cenario", i) for i in ("costa_areia_faixa_base", "costa_areia_faixa", "costa_areia_ponta")):
            return
        rnd = random.Random("%s|espetos" % self.c.semente)
        feitos = []
        reserva = set(self.mar_fixo) | set(self.sob_ponte)
        for q in sorted(tt):
            cat, id_, r, tipo = tt[q]
            if id_ != "costa_areia_reta" or rnd.random() > 0.07:
                continue
            d = rot_dir("N", r)
            f = DIRS[d]
            u = (-f[1], f[0])
            n = rnd.choice((2, 2, 3))
            cels = [(q[0] + f[0] * k, q[1] + f[1] * k) for k in range(1, n + 1)]
            viz = [(v[0] + u[0] * s_, v[1] + u[1] * s_) for v in cels for s_ in (-1, 1)] + \
                  [(q[0] + f[0] * (n + 1), q[1] + f[1] * (n + 1))]
            if not all(tt.get(v, ("", ""))[1] in ("mar",) and v not in reserva for v in cels + viz):
                continue
            if any(abs(q[0] - a) + abs(q[1] - b) < 8 for a, b in feitos):
                continue
            feitos.append(q)
            tt[q] = ("cenario", "costa_areia_faixa_base", r, "costa")
            for k, v in enumerate(cels):
                tt[v] = ("cenario", "costa_areia_ponta" if k == n - 1 else "costa_areia_faixa", r, "costa")
        self.n_espetos = len(feitos)

    # ------------------------------------------------------------------------------------------ utilidades
    def livre(self, q):
        return q not in self.tipo

    def piso(self, q, id_="piso_calcada_lisa", tipo="lote", cat="pisos", r=0):
        self.tipo[q] = tipo
        return self.c.add(cat, id_, *cc(*q), 0, r)

    def fronts(self, q, tipos=("rua",)):
        out = []
        for d, (dx, dy) in DIRS.items():
            if self.tipo.get((q[0] + dx, q[1] + dy)) in tipos:
                out.append(d)
        return out

    def coloca_predio(self, cat, id_, cels, d, rnd, recuo=0.8):
        """Prédio no lote 'cels' (lista de quadras), de frente para d. Devolve a peça ou None."""
        lo, hi = B.caixa(cat, id_)
        f = DIRS[d]
        u = (-f[1], f[0])
        # largura (ao longo da frente) e fundo do lote em quadras
        us = {q[0] * u[0] + q[1] * u[1] for q in cels}
        bs = {-(q[0] * f[0] + q[1] * f[1]) for q in cels}
        w, dd = len(us), len(bs)
        bw, bd = hi[0] - lo[0], hi[1] - lo[1]
        if bw > Q * w - 0.8 or bd > Q * dd - recuo - 0.3:
            return None
        cx = sum(cc(*q)[0] for q in cels) / len(cels)
        cy = sum(cc(*q)[1] for q in cels) / len(cels)
        r = facing_r(d)
        ox = -(lo[0] + hi[0]) / 2 + rnd.uniform(-0.3, 0.3) * max(0.0, Q * w - 0.8 - bw)
        oy = -Q * dd / 2 + recuo - lo[1]
        dx, dy = rp(ox, oy, r)
        if self.c.colide({"c": cat, "i": id_, "p": [cx + dx, cy + dy, 0.0], "r": r}):
            return None
        p = self.c.add(cat, id_, cx + dx, cy + dy, 0, r)
        if p is not None:
            p["_lote"] = (cx, cy, w, dd, r, lo, hi, ox, oy)
        return p

    # ------------------------------------------------------------------------------------------ lotes
    def componentes(self, cels):
        cels = set(cels)
        out = []
        while cels:
            q0 = min(cels)
            pilha, comp = [q0], set()
            cels.discard(q0)
            while pilha:
                q = pilha.pop()
                comp.add(q)
                for dx, dy in DIRS.values():
                    v = (q[0] + dx, q[1] + dy)
                    if v in cels:
                        cels.discard(v)
                        pilha.append(v)
            out.append(sorted(comp))
        return out

    def eh_nucleo(self, q):
        d = self.dist_de.get(q)
        return d is not None and d.nome == "centro" and -4 <= q[0] <= 5 and 5 <= q[1] <= 16

    MARCO_ESTILO = {"delegacia": ("china", "eco"), "enigma": ("futurista",), "basquete": ("eco",),
                    "aquario": ("regular", "centro"), "hospital": ("regular",), "bombeiro": ("regular",),
                    "lanchonete": ("regular", "centro"), "shopping": ("eco",), "academia": ("futurista", "regular"),
                    "apartamento": ("regular", "centro"), "telao": ("futurista",)}

    def opcoes_predio(self, q):
        est = self.estilo_de(q)
        E = ESTILO[est]
        ops = list(E["predios"]())
        for i in B.ids("cenario"):
            tg = B.tags("cenario", i)
            if "predio" not in tg and "marco_predio" not in tg:
                continue
            for k, e in self.MARCO_ESTILO.items():
                if k in i and est in e and self.c.uso[("cenario", i)] < (2 if k == "delegacia" else 3):
                    ops.append(("cenario", i, 4.0 if self.c.uso[("cenario", i)] == 0 else 0.5))
        if est == "centro":
            nuc = self.eh_nucleo(q)
            ops = [(c, i, (0.55 if nuc else 0.03) if c == "arranha_ceus" else (0.6 if nuc else 1.0)) for c, i, _ in ops]
        if est == "china" and q[0] >= -12:   # borda leste: arranha-céus e regulares se misturando
            ops += [("predios_regulares", i, 0.3) for i in B.ids("predios_regulares")][:8]
        return ops

    def enche_bloco(self, cels, frente=("rua",)):
        c = self.c
        rnd = c.rnd("bloco", cels[0])
        livres = set(cels)
        ordem = [q for q in cels if self.fronts(q, frente)]
        rnd.shuffle(ordem)
        ordem.sort(key=lambda q: -len(self.fronts(q, frente)))  # esquinas primeiro
        for q in ordem:
            if q not in livres:
                continue
            F = self.fronts(q, frente)
            est = self.estilo_de(q)
            E = ESTILO.get(est)
            if not E:
                continue
            ops = self.opcoes_predio(q)
            feito = False
            for tent in range(14):
                esc = c.escolhe(rnd, ops)
                if not esc:
                    break
                cat, id_ = esc
                lo, hi = B.caixa(cat, id_)
                bw, bd = hi[0] - lo[0], hi[1] - lo[1]
                w = max(1, math.ceil((bw + 0.8) / Q))
                dd = max(1, math.ceil((bd + 1.1) / Q))
                if w * dd > 1 and rnd.random() > E["grande"] + (0.5 if cat == "arranha_ceus" else 0.0):
                    continue
                Fs = F[:]
                rnd.shuffle(Fs)
                for d in Fs:
                    f = DIRS[d]
                    u = (-f[1], f[0])
                    for k0 in range(w):
                        a = (q[0] - k0 * u[0], q[1] - k0 * u[1])
                        lote = [(a[0] + k * u[0] - m * f[0], a[1] + k * u[1] - m * f[1]) for m in range(dd)
                                for k in range(w)]
                        if not all(v in livres for v in lote):
                            continue
                        if not all(self.tipo.get((v[0] + f[0], v[1] + f[1])) in frente for v in lote[:w]):
                            continue
                        if classe(cat, id_) == "tile":   # prédio com chão próprio (cobre o lote inteiro)
                            lo_, hi_ = B.caixa(cat, id_)
                            if abs((hi_[0] - lo_[0]) - Q * w) > 0.6 or abs((hi_[1] - lo_[1]) - Q * dd) > 0.6:
                                continue
                            c.add(cat, id_, *self.centro_de(lote), 0, facing_r(d))
                            for v in lote:
                                self.tipo[v] = "lote"
                                livres.discard(v)
                            feito = True
                            break
                        p = self.coloca_predio(cat, id_, lote, d, rnd)
                        if p is None:
                            continue
                        pisos_ = E["piso"]
                        pid = pisos_[rnd.randrange(len(pisos_))]
                        for v in lote:
                            self.piso(v, pid)
                            livres.discard(v)
                        self.decora_lote(p, est, rnd)
                        feito = True
                        break
                    if feito:
                        break
                if feito:
                    break
        # o que sobrou: miolo de quadra (praça, jardim ou estacionamento)
        for q in sorted(livres):
            est = self.estilo_de(q)
            u = rnd.random()
            if est in ("china", "centro", "regular") and self.fronts(q) and u < 0.45:
                self.piso(q, "estacionamento_quadra", cat="estacionamentos", r=facing_r(self.fronts(q)[0]) + 90)
                self.carros_estacionamento(q, rnd)
            elif est in ("china", "centro", "futurista") and u < 0.75:
                self.piso(q, "piso_praca", tipo="praca")
                self.praca(q, rnd, est)
            else:
                self.piso(q, "piso_grama", tipo="verde")
                self.jardim(q, rnd, est)

    def decora_lote(self, p, est, rnd):
        cx, cy, w, dd, r, lo, hi, ox, oy = p["_lote"]
        c = self.c
        E = ESTILO[est]
        fundo = Q * dd / 2 - (oy + hi[1])
        lado = (Q * w - (hi[0] - lo[0])) / 2
        pts = []
        if fundo > 3.2:
            yb = oy + hi[1] + fundo / 2
            for xb in ([-Q * w / 4, Q * w / 4] if w > 1 else [rnd.uniform(-3, 3)]):
                pts.append((xb, yb, "arvore"))
        if lado > 2.4:
            for sx in (-1, 1):
                pts.append((sx * (Q * w / 2 - lado / 2), oy + (lo[1] + hi[1]) / 2, "arbusto"))
        for lx, ly, k in pts:
            x, y = rp(lx, ly, r)
            if k == "arvore":
                esc = c.escolhe(rnd, E["arvores"] if est not in ("china", "centro", "regular") else ARVORES_RUA)
            else:
                esc = c.escolhe(rnd, ARBUSTOS)
            if esc:
                c.tenta(esc[0], esc[1], cx + x, cy + y, 0, rnd.randrange(0, 360, 30))

    def praca(self, q, rnd, est):
        c = self.c
        x, y = cc(*q)
        centro = c.escolhe(rnd, [("parque_areas", "chafariz_praca", 1.0), ("parque_areas", "fountain_03_pacote", 0.6),
                                 ("vegetacao", "arvore_redonda_grande", 1.0), ("parque_areas", "coreto", 0.3)])
        if centro:
            c.tenta(centro[0], centro[1], x, y, 0, 0)
        for k, (dx, dy) in enumerate(((-5, -5), (5, 5), (-5, 5), (5, -5))):
            esc = c.escolhe(rnd, ARVORES_RUA)
            c.tenta(esc[0], esc[1], x + dx, y + dy, 0, rnd.randrange(0, 360, 45))
        for dx, dy, g in ((0, -5.2, 0), (0, 5.2, 180), (-5.2, 0, 270), (5.2, 0, 90)):
            c.tenta("mobiliario_urbano", "banco_praca_madeira", x + dx, y + dy, 0, g + 180)
        c.tenta("mobiliario_urbano", "poste_praca_4_lanternas", x + 3.2, y - 3.2, 0, 0)
        c.tenta("mobiliario_urbano", "lixeira_comum", x - 3.0, y + 3.4, 0, 0)

    def jardim(self, q, rnd, est, n=None):
        c = self.c
        x, y = cc(*q)
        E = ESTILO.get(est, ESTILO["regular"])
        arv = E["arvores"] if est not in ("china", "centro", "regular", "verde") else ARVORES_PARQUE
        n = n if n is not None else rnd.randint(2, 4)
        for k in range(n * 3):
            if n <= 0:
                break
            esc = c.escolhe(rnd, arv)
            if esc and c.tenta(esc[0], esc[1], x + rnd.uniform(-4.5, 4.5), y + rnd.uniform(-4.5, 4.5), 0,
                               rnd.randrange(0, 360, 30)):
                n -= 1
        for k in range(rnd.randint(1, 3)):
            esc = c.escolhe(rnd, ARBUSTOS)
            if esc:
                c.tenta(esc[0], esc[1], x + rnd.uniform(-6, 6), y + rnd.uniform(-6, 6), 0, rnd.randrange(0, 360, 30))
        if rnd.random() < 0.4:
            c.tenta("mobiliario_urbano", "banco_praca_madeira", x + rnd.uniform(-3, 3), y + rnd.uniform(-3, 3), 0,
                    rnd.randrange(0, 360, 90))

    def lotes(self):
        for d in DISTRITOS:
            if d.estilo in ("parque", "diversoes", "observatorio"):
                continue
            cels = [q for q in ret_set(d.i0, d.i1, d.j0, d.j1) if d.dentro(q) and self.livre(q)]
            for b in self.componentes(cels):
                self.enche_bloco(b)

    def carros_estacionamento(self, q, rnd):
        c = self.c
        x, y = cc(*q)
        p = [pp for pp in c.pecas if pp["i"] == "estacionamento_quadra" and pp["p"][:2] == [x, y]]
        r = p[0]["r"] if p else 0
        vagas = [(vx, vy) for vx in (-5.0, -2.5, 0.0, 2.5, 5.0) for vy in (-4.3, 4.3)]
        rnd.shuffle(vagas)
        for lx, ly in vagas[:rnd.randint(3, 7)]:
            dx, dy = rp(lx, ly, r)
            esc = c.escolhe(rnd, CARROS_COMUNS[:19])
            if esc:
                c.tenta(esc[0], esc[1], x + dx, y + dy, Z_ASF, r + (0 if ly > 0 else 180), chao=("estacionamento",))

    # ------------------------------------------------------------------------------------------ áreas especiais
    def centro_de(self, cels):
        return (sum(cc(*q)[0] for q in cels) / len(cels), sum(cc(*q)[1] for q in cels) / len(cels))

    def viaduto_chao(self):
        c = self.c
        for cels in self.viadutos_cel:
            for q in cels[2:-2]:
                x, y = cc(*q)
                if self.tipo.get(q) == "rua":
                    c.add("estruturas", "viaduto_rua_vao", x, y, 0, 90)
                else:
                    self.piso(q, "piso_calcada_lisa", tipo="esp")
                    c.add("estruturas", "viaduto_rua", x, y, 0, 90)

    PARQUE_MAPA = [  # linha b = 8 (norte) até 0 (sul); colunas a = 0..9
        "CCAAMMETpg",
        "CCAAMMETgg",
        "<----->---".replace(">", "^"),
        "gPggLL|ghg",
        "ggggLL|ggo",
        "------O---",
        "ZZsgcg|ttk",
        "ZZgggg|ttq",
        "gggggg|ggg",
    ]

    def parque(self, d):
        c = self.c
        rnd = c.rnd("parque")
        i0, j0 = d.i0 + 1, d.j0 + 1
        nb = len(self.PARQUE_MAPA)

        def q_(a, b):
            return (i0 + a, j0 + b)

        feitos = set()
        caminhos = []
        for linha_k, linha in enumerate(self.PARQUE_MAPA):
            b = nb - 1 - linha_k
            for a, ch in enumerate(linha):
                q = q_(a, b)
                if q in feitos:
                    continue
                x, y = cc(*q)
                if ch in "-|<":
                    self.piso(q, "caminho_parque_reta", tipo="parque", cat="parque_areas", r=90 if ch in "-<" else 0)
                    caminhos.append((q, 90 if ch in "-<" else 0))
                elif ch == "^":
                    self.piso(q, "caminho_parque_t", tipo="parque", cat="parque_areas", r=0)
                elif ch == "O":
                    self.piso(q, "praca_redonda", tipo="parque", cat="parque_areas")
                    c.add("parque_areas", "chafariz_praca", x, y, 0, 0)
                elif ch in "CAMLZ":
                    cels = [q_(a, b), q_(a + 1, b), q_(a, b - 1), q_(a + 1, b - 1)]
                    feitos |= set(cels)
                    cx, cy = self.centro_de(cels)
                    if ch == "C":
                        for v in cels:
                            self.piso(v, "piso_grama", tipo="parque")
                        c.add("predios_magicos", "castelo_rosa", cx, cy, 0, 0)
                    else:
                        cat, id_ = {"A": ("parque_brinquedos", "parque_aquatico"),
                                    "M": ("parque_brinquedos", "montanha_russa_loopings"),
                                    "L": ("parque_areas", "lago_caminho"), "Z": ("parque_areas", "zoologico")}[ch]
                        for v in cels:
                            self.tipo[v] = "parque"
                        c.add(cat, id_, cx, cy, 0, 0)
                        if ch == "Z":
                            self.zoo(cx, cy, rnd)
                elif ch in "ps":
                    self.piso(q, "playground" if ch == "p" else "pista_skate", tipo="parque", cat="parque_areas")
                elif ch == "P":
                    self.piso(q, "palco_festival", tipo="parque", cat="parque_areas", r=0)
                else:
                    self.piso(q, "piso_grama", tipo="parque")
                    if ch == "E" and b == nb - 1:
                        c.add("parque_brinquedos", "estatua_menina", x, y, 0, 0)
                    elif ch == "E":
                        c.add("parque_brinquedos", "castelo_mureta", x, y + 4.0, 0, 0)
                        c.add("parque_brinquedos", "castelo_cone_telhado", x - 4.6, y - 2.0, 0, 0)
                        c.add("parque_brinquedos", "castelo_torre_baixa", x + 4.6, y - 2.0, 0, 0)
                    elif ch == "T":
                        c.add("parque_brinquedos", "castelo_portao", x, y - 4.0, 0, 0)
                        c.add("parque_brinquedos", "castelo_torre_alta", x - 4.6, y + 1.5, 0, 0)
                        c.add("parque_brinquedos", "castelo_torre_alta", x + 4.6, y + 1.5, 0, 0)
                        c.add("parque_brinquedos", "castelo_torre_baixa", x, y + 4.4, 0, 0)
                    elif ch == "h":
                        c.add("predios_magicos", "casa_arvore", x, y, 0, 270)
                    elif ch == "o":
                        c.add("parque_areas", "obelisco", x, y, 0, 0)
                    elif ch == "c":
                        c.add("parque_areas", "coreto", x, y, 0, 0)
                    elif ch == "t":
                        pass
                    elif ch == "k":
                        c.add("predios_magicos", "casa_cogumelo_vermelho", x, y, 0, 270)
                    elif ch == "q":
                        c.add("parque_areas", "quiosque_sorvete", x - 3.5, y + 2.0, 0, 270)
                        c.add("parque_areas", "quiosque_pipoca", x - 3.5, y - 2.5, 0, 270)
                        c.add("parque_areas", "bilheteria_ingressos", x + 3.5, y, 0, 90)
        # tendas de circo na área "tt"
        tt = [q_(a, b) for b in (1, 2) for a in (7, 8)]
        cx, cy = self.centro_de(tt)
        c.tenta("parque_areas", "tenda_circo_grande", cx - 7.2, cy + 7.2, 0, 0)
        c.tenta("parque_areas", "tenda_circo_media", cx + 8.5, cy + 8.5, 0, 20)
        c.tenta("parque_areas", "tenda_circo_pequena", cx + 8.5, cy - 8.5, 0, 340)
        c.tenta("parque_areas", "tenda_circo_pequena", cx - 8.0, cy - 8.5, 0, 15)
        # postes de 4 lâmpadas a cada ~7,5 m ao longo dos caminhos, com bancos e lixeiras junto
        for q, r in caminhos:
            x, y = cc(*q)
            for k, s_ in ((-3.75, 1), (3.75, -1)):
                lx, ly = s_ * 2.4, k
                dx, dy = rp(lx, ly, r)
                c.tenta("mobiliario_urbano", "poste_praca_4_lanternas", x + dx, y + dy, 0, 0)
                dx, dy = rp(s_ * 2.5, k + (1.6 if k < 0 else -1.6), r)
                c.tenta("mobiliario_urbano", "banco_praca_madeira", x + dx, y + dy, 0, r + (90 if s_ > 0 else 270))
                dx, dy = rp(s_ * 2.3, k + (-1.2 if k < 0 else 1.2), r)
                c.tenta("mobiliario_urbano", "lixeira_comum", x + dx, y + dy, 0, 0)
        # árvores, arbustos e floreiras na grama
        for q in sorted(ret_set(d.i0 + 1, d.i1 - 1, d.j0 + 1, d.j1 - 1)):
            p = [pp for pp in c.pecas if pp["c"] in ("pisos", "parque_areas") and pp["p"][:2] == list(cc(*q))]
            if p and p[0]["i"] in ("piso_grama", "caminho_parque_reta", "caminho_parque_t"):
                self.jardim(q, rnd, "verde", n=rnd.randint(2, 5) if p[0]["i"] == "piso_grama" else 2)
        # brinquedos de praça, carrinhos e mesas na grama
        extras = [("props_lazer", i, 1.0) for i in ("balanco_duplo", "escorregador_praca", "gangorra_praca",
                                                    "gira_gira_praca", "carrinho_baloes", "carrinho_cachorro_quente",
                                                    "carrinho_pipoca", "carrinho_algodao_doce", "banco_circular_arvore",
                                                    "mesa_piquenique_coberta", "placa_direcoes_parque",
                                                    "chafariz_globo", "cama_elastica", "trepa_trepa_cubos")]
        for q in sorted(ret_set(d.i0 + 1, d.i1 - 1, d.j0 + 1, d.j1 - 1)):
            p = [pp for pp in c.pecas if pp["c"] == "pisos" and pp["p"][:2] == list(cc(*q))]
            if p and p[0]["i"] == "piso_grama" and rnd.random() < 0.6:
                esc = c.escolhe(rnd, extras)
                c.tenta(esc[0], esc[1], cc(*q)[0] + rnd.uniform(-4, 4), cc(*q)[1] + rnd.uniform(-4, 4), 0,
                        rnd.randrange(0, 360, 45))
        # anfiteatro e palco coberto perto do festival
        qp = q_(1, 4)
        c.tenta("props_lazer", "arquibancada_praca", cc(*qp)[0], cc(*qp)[1] + 2.0, 0, 180)
        qp = q_(9, 5)
        c.tenta("props_lazer", "palco_coberto_pequeno", cc(*qp)[0], cc(*qp)[1], 0, 90)
        # cachorros passeando
        for k, (bid, anim) in enumerate((("golden", "andar"), ("lulu", "parado"), ("caramelo", "andar"))):
            q, r = caminhos[(k * 7 + 3) % len(caminhos)]
            x, y = cc(*q)
            dx, dy = rp(0.6, 0, r)
            c.tenta("bichos", bid, x + dx, y + dy, 0, r, chao=("livre", "caminho"), anim=anim)

    def zoo(self, cx, cy, rnd):
        """Bichos nos recintos do zoológico (RECINTOS de parque_areas_areas)."""
        rec = {"ursos": (0.3, -8.5, ["urso"]), "hipopotamos": (-8.5, 0.2, ["hipopotamo"]),
               "leoes": (0.0, 0.2, ["leao", "leao"]), "girafas": (8.6, 0.0, ["girafa"]),
               "elefantes": (0.2, 8.6, ["elefante"]), "pinguins": (8.5, 8.5, ["pinguim", "pinguim", "pinguim"]),
               "macacos": (-8.4, 8.6, ["canguru", "canguru"]), "flamingos": (8.6, -8.3, ["pato", "pato"])}
        for nome, (x, y, bichos) in rec.items():
            for k, b in enumerate(bichos):
                ang = rnd.randrange(0, 360, 30)
                ox, oy = (k - (len(bichos) - 1) / 2) * 2.3, 0.0
                self.c.add("bichos", b, cx + x + ox, cy + y + oy, 0.06, ang, anim="parado" if k else "comer")

    DIVERSOES_MAPA = [  # b = 6 (norte) .. 0; a = 0..10
        "ggggg|ggggg",
        "gggggfggggg",
        "ggggg|ggggg",
        "TgkgW|gkggg",
        "-----O-----",
        "DDDgg|gggSg",
        "DDDRRgCXVBg",
    ]

    def diversoes(self, d):
        c = self.c
        rnd = c.rnd("diversoes")
        i0, j0 = d.i0 + 1, d.j0 + 1
        nb = len(self.DIVERSOES_MAPA)
        feitos = set()
        caminhos = []
        for lk, linha in enumerate(self.DIVERSOES_MAPA):
            b = nb - 1 - lk
            for a, ch in enumerate(linha):
                q = (i0 + a, j0 + b)
                if q in feitos or b < 0:
                    continue
                x, y = cc(*q)
                if ch in "-|":
                    self.piso(q, "caminho_parque_reta", tipo="parque", cat="parque_areas", r=90 if ch == "-" else 0)
                    caminhos.append((q, 90 if ch == "-" else 0))
                elif ch == "O":
                    self.piso(q, "praca_redonda", tipo="parque", cat="parque_areas")
                    c.add("parque_areas", "chafariz_praca", x, y, 0, 0)
                elif ch == "f":
                    self.piso(q, "caminho_parque_fim", tipo="parque", cat="parque_areas", r=180)
                elif ch == "D":
                    cels = [(i0 + a + k, j0 + b - m) for k in range(3) for m in range(2)]
                    feitos |= set(cels)
                    for v in cels:
                        self.tipo[v] = "parque"
                    cx, cy = self.centro_de(cels)
                    c.add("parque_brinquedos", "montanha_russa_dragao", cx, cy, 0, 0)
                elif ch == "R":
                    cels = [(i0 + a, j0 + b), (i0 + a + 1, j0 + b)]
                    feitos |= set(cels)
                    for v in cels:
                        self.piso(v, "piso_ladrilho_rosado", tipo="parque")
                    cx, cy = self.centro_de(cels)
                    c.add("parque_brinquedos", "roda_gigante", cx, cy + 1.5, 0, 0)
                elif ch == "S":
                    self.piso(q, "trenzinho_infantil", tipo="parque", cat="parque_brinquedos")
                else:
                    self.piso(q, "piso_ladrilho_rosado" if ch != "g" or (a + b) % 3 else "piso_grama", tipo="parque")
                    ride = {"C": "carrossel", "X": "xicaras_malucas", "V": "barco_viking", "B": "carrinhos_bate_bate",
                            "T": "torre_queda", "W": "carrossel"}.get(ch)
                    if ride:
                        c.add("parque_brinquedos", ride, x, y, 0, 0 if ch != "V" else 0)
                    elif ch == "k":
                        c.tenta("parque_areas", "quiosque_algodao_doce", x - 3.0, y + 3.0, 0, 0)
                        c.tenta("parque_areas", "quiosque_pipoca", x + 3.0, y + 3.0, 0, 0)
                        c.tenta("parque_areas", "bilheteria_ingressos", x, y - 3.5, 0, 0)
        for q, r in caminhos:
            x, y = cc(*q)
            for k, s_ in ((-3.75, 1), (3.75, -1)):
                dx, dy = rp(s_ * 2.4, k, r)
                c.tenta("mobiliario_urbano", "poste_praca_4_lanternas", x + dx, y + dy, 0, 0)
                dx, dy = rp(s_ * 2.5, k + (1.6 if k < 0 else -1.6), r)
                c.tenta("mobiliario_urbano", "banco_praca_madeira", x + dx, y + dy, 0, r + (90 if s_ > 0 else 270))
        for q in sorted(ret_set(d.i0 + 1, d.i1 - 1, d.j0 + 1, d.j1 - 1)):
            p = [pp for pp in c.pecas if pp["c"] == "pisos" and pp["p"][:2] == list(cc(*q))]
            if p:
                for k in range(3):
                    c.tenta("vegetacao", "palmeira", cc(*q)[0] + rnd.uniform(-5, 5), cc(*q)[1] + rnd.uniform(-5, 5), 0,
                            rnd.randrange(0, 360, 30))
                if rnd.random() < 0.5:
                    esc = c.escolhe(rnd, [("parque_areas", "quiosque_sorvete", 1), ("parque_areas", "quiosque_pipoca", 1),
                                          ("parque_areas", "quiosque_algodao_doce", 1)])
                    c.tenta(esc[0], esc[1], cc(*q)[0] + rnd.uniform(-4, 4), cc(*q)[1] + rnd.uniform(-4, 4), 0,
                            rnd.randrange(0, 360, 90))

    def plato_cristal(self):
        """Praça do cristal no alto de um platô de 6 × 6 quadras com muro de arrimo: moldura de bordas e cantos, o alto
        (4 × 4) com o anel de rua em z = 3,75, a praça do cristal (2 × 2) no meio e a rampa de rua descendo ao norte."""
        c = self.c
        if not all(B.tem("cenario", i) for i in ("plato_topo", "plato_borda", "plato_canto_ext", "plato_rampa_rua",
                                                  "praca_cristal")):
            return self.praca_cristal()
        i0, i1, j0, j1 = PLATO_CRISTAL
        Z = Z_PLATO
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                q = (i, j)
                self.tipo[q] = "esp"
                if q == RAMPA_PLATO:
                    c.add("cenario", "plato_rampa_rua", *cc(*q), 0, 180)
                    continue
                bi, bj = i in (i0, i1), j in (j0, j1)
                if bi and bj:
                    g = {(i0, j0): 0, (i1, j0): 90, (i1, j1): 180, (i0, j1): 270}[q]
                    c.add("cenario", "plato_canto_ext", *cc(*q), 0, g)
                elif bi or bj:
                    g = 0 if j == j0 else (180 if j == j1 else (270 if i == i0 else 90))
                    c.add("cenario", "plato_borda", *cc(*q), 0, g)
                else:
                    # o alto fica 42 cm mais baixo: a rua e a praça (laje até −0,40) assentam nele com a calçada
                    # exatamente em 3,75, na altura do alto das bordas e do fim da rampa
                    c.add("cenario", "plato_topo", *cc(*q), Z_SOB_PLATO, 0)
        # anel de rua no alto (4 × 4 menos o miolo 2 × 2)
        a0, a1, b0, b1 = i0 + 1, i1 - 1, j0 + 1, j1 - 1
        anel = {}
        for i in range(a0, a1 + 1):
            for j in range(b0, b1 + 1):
                if i in (a0, a1) or j in (b0, b1):
                    br = {}
                    for d, (dx, dy) in DIRS.items():
                        v = (i + dx, j + dy)
                        if a0 <= v[0] <= a1 and b0 <= v[1] <= b1 and (v[0] in (a0, a1) or v[1] in (b0, b1)):
                            br[d] = "rua"
                    if (i, j + 1) == RAMPA_PLATO:
                        br["N"] = "rua"
                    anel[(i, j)] = br
        for q, br in sorted(anel.items()):
            i_, r = peca_rua(br)
            if i_ == "rua_cruzamento_t":
                i_ = "rua_cruzamento_t_faixas"
            c.add("ruas", i_, *cc(*q), Z, r)
        cx, cy = self.centro_de([(a0 + 1, b0 + 1), (a0 + 2, b0 + 2)])
        c.add("cenario", "praca_cristal", cx, cy, Z, 0)
        self.mapa_local()
        rnd = c.rnd("plato")
        # postes, árvores e bancos nas calçadas do anel
        for q, br in sorted(anel.items()):
            x, y = cc(*q)
            for dx, dy in ((-5.0, -5.0), (5.0, 5.0), (-5.0, 5.0), (5.0, -5.0)):
                if rnd.random() < 0.5:
                    c.tenta("props_lazer", "poste_lanternas_chinesas", x + dx, y + dy, Z, rnd.choice((0, 90)))
                else:
                    esc = c.escolhe(rnd, ARVORES_RUA)
                    c.tenta(esc[0], esc[1], x + dx, y + dy, Z, rnd.randrange(0, 360, 30))
        # na grama de baixo, em volta do platô: árvores
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                if (i, j) != RAMPA_PLATO and (i in (i0, i1) or j in (j0, j1)):
                    x, y = cc(i, j)
                    ox = -4.5 if i == i0 else (4.5 if i == i1 else 0.0)
                    oy = -4.5 if j == j0 else (4.5 if j == j1 else 0.0)
                    esc = c.escolhe(rnd, ARVORES_RUA)
                    c.tenta(esc[0], esc[1], x + ox + rnd.uniform(-1.5, 1.5), y + oy + rnd.uniform(-1.5, 1.5), 0,
                            rnd.randrange(0, 360, 30))

    def mapa_local(self):
        self.c.mapa = Mapa(self.c.pecas)

    def calcadao(self):
        """Calçadão da praia ao sul de Chinatown: ciclovia (fileira de cima) e a laje de ladrilho com balaustrada do lado
        da areia, bancos e lixeiras."""
        c = self.c
        if not (B.tem("props_rua", "ciclovia_reta") and B.tem("props_rua", "laje_calcadao")):
            return
        js = sorted({q[1] for q in CALCADAO})
        for q in sorted(CALCADAO):
            self.tipo[q] = "esp"
            if q[1] == js[-1]:
                c.add("props_rua", "ciclovia_reta", *cc(*q), 0, 90)
            else:
                c.add("props_rua", "laje_calcadao", *cc(*q), 0, 0)
        self.mapa_local()
        rnd = c.rnd("calcadao")
        for q in sorted(CALCADAO):
            if q[1] != js[0]:
                continue
            x, y = cc(*q)
            c.tenta("props_rua", "balaustrada_15m", x, y - H + 0.4, 0, 0, s=0.99)
            c.tenta("props_rua", "banco_calcadao", x - 3.5, y - H + 1.6, 0, 180)
            c.tenta("props_rua", "banco_calcadao", x + 3.5, y - H + 1.6, 0, 180)
            c.tenta("props_rua", "lixeira_calcadao", x, y - H + 1.4, 0, 0)
            c.tenta("vegetacao", "palmeira", x + rnd.uniform(-1, 1), y + 2.5, 0, rnd.randrange(0, 360, 30))
            if q[0] % 2 == 0:
                c.tenta("mobiliario_urbano", "poste_rua", x + 6.0, y + 5.6, 0, 0)

    def terracos(self):
        """Platôs com muro de arrimo no bairro ecológico: a quadra inteira sobe 3,75 m e o prédio fica no alto."""
        c = self.c
        if not all(B.tem("cenario", i) for i in ("plato_topo", "plato_borda", "plato_canto_ext")):
            return
        for k, (i0, i1, j0, j1) in enumerate(TERRACOS):
            cels = [(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1)]
            if not all(self.livre(q) for q in cels):
                continue
            for (i, j) in cels:
                q = (i, j)
                self.tipo[q] = "esp"
                bi, bj = i in (i0, i1), j in (j0, j1)
                if bi and bj:
                    g = {(i0, j0): 0, (i1, j0): 90, (i1, j1): 180, (i0, j1): 270}[q]
                    c.add("cenario", "plato_canto_ext", *cc(*q), 0, g)
                elif bi or bj:
                    g = 0 if j == j0 else (180 if j == j1 else (270 if i == i0 else 90))
                    c.add("cenario", "plato_borda", *cc(*q), 0, g)
                else:
                    c.add("cenario", "plato_topo", *cc(*q), 0, 0)
            self.mapa_local()
            rnd = c.rnd("terraco", k)
            x0, x1 = Q * i0 + H, Q * i1 + H          # o alto vai do meio da primeira ao meio da última quadra
            y0, y1 = Q * j0 + H, Q * j1 + H
            larg, alt = x1 - x0 - 1.6, y1 - y0 - 1.6
            ops = [("predios_ecologicos", i, 1.0) for i in B.ids("predios_ecologicos") if not i.endswith("_pacote")]
            rnd.shuffle(ops)
            feito = False
            for cat, idd, _ in ops:
                lo, hi = B.caixa(cat, idd)
                bw, bd = hi[0] - lo[0], hi[1] - lo[1]
                for g, (w, d) in ((0, (bw, bd)), (90, (bd, bw))):
                    if w <= larg and d <= alt and c.uso[(cat, idd)] < 2:
                        ox, oy = rp(-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, g)
                        g2 = g + (180 if rnd.random() < 0.5 else 0)
                        ox, oy = rp(-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, g2)
                        if c.tenta(cat, idd, (x0 + x1) / 2 + ox, (y0 + y1) / 2 + oy, Z_PLATO, g2, chao=("livre",)):
                            feito = True
                            break
                if feito:
                    break
            for t in range(10):
                esc = c.escolhe(rnd, ARVORES_PARQUE)
                c.tenta(esc[0], esc[1], rnd.uniform(x0 + 0.8, x1 - 0.8), rnd.uniform(y0 + 0.8, y1 - 0.8), Z_PLATO,
                        rnd.randrange(0, 360, 30), chao=("livre",))
            for t in range(6):   # na grama de baixo, junto do muro
                esc = c.escolhe(rnd, ARBUSTOS)
                q = cels[rnd.randrange(len(cels))]
                c.tenta(esc[0], esc[1], cc(*q)[0] + rnd.uniform(-6.5, 6.5), cc(*q)[1] + rnd.uniform(-6.5, 6.5), 0,
                        rnd.randrange(0, 360, 30), chao=("livre",))

    def praca_cristal(self):
        """Praça do cristal no miolo da quadra de 3 × 3 de Chinatown: a peça do cenário se existir; senão o cristal
        roxo sobre a grama, com praça em volta."""
        c = self.c
        cels = sorted(ret_set(-24, -23, 11, 12))
        cx, cy = self.centro_de(cels)
        if B.tem("cenario", "praca_cristal"):
            for q in cels:
                self.tipo[q] = "esp"
            c.add("cenario", "praca_cristal", cx, cy, 0, 0)
            return
        cels = sorted(ret_set(-24, -22, 11, 13))
        cx, cy = self.centro_de(cels)
        for q in cels:
            self.piso(q, "piso_grama" if q == (-23, 12) else "piso_praca", tipo="esp")
        c.add("predios_magicos", "cristais_roxos", cx, cy, 0, 0)
        rnd = c.rnd("cristal")
        for q in cels:
            if q != (-23, 12):
                x, y = cc(*q)
                esc = c.escolhe(rnd, ARVORES_RUA)
                c.tenta(esc[0], esc[1], x + (q[0] + 23) * 2.5, y + (q[1] - 12) * 2.5, 0, 0)
                c.tenta("mobiliario_urbano", "poste_praca_4_lanternas", x - (q[0] + 23) * 3.0, y - (q[1] - 12) * 3.0,
                        0, 0)

    def vila_magica(self):
        c = self.c
        nome, i0, i1, j0, j1 = ZONAS_VERDES[0]
        ic = (i0 + i1) // 2
        linhas = [j0 + 4, j0 + 8, j0 + 12]
        cam = {}
        for j in range(j0 + 1, j1):
            cam[(ic, j)] = {"N", "S"}
        cam[(ic, j0 + 1)] = {"N"}
        cam[(ic, j1 - 1)] = {"S"}
        for jl in linhas:
            for i in range(i0 + 1, i1 + 1):
                cam.setdefault((i, jl), set())
                cam[(i, jl)] |= {"E", "W"}
            cam[(i0 + 1, jl)].discard("W")
        for q, br in sorted(cam.items()):
            brd = {d: "rua" for d in br}
            i_, r = peca_rua(brd)
            ids = {"rua_reta": "caminho_parque_reta", "rua_cruzamento_x": "caminho_parque_cruz",
                   "rua_cruzamento_t": "caminho_parque_t", "rua_curva": "caminho_parque_curva",
                   "rua_fim": "caminho_parque_fim"}
            self.piso(q, ids[i_], tipo="caminho", cat="parque_areas", r=r)
        cels = [q for q in ret_set(i0, i1, j0, j1) if self.livre(q)]
        for b in self.componentes(cels):
            self.enche_bloco(b, frente=("caminho",))
        # postes de praça nos caminhos
        for q in sorted(cam):
            x, y = cc(*q)
            if (q[0] + q[1]) % 2 == 0:
                c.tenta("mobiliario_urbano", "poste_praca_4_lanternas", x + 2.4, y + 2.4, 0, 0)

    def marina(self):
        c = self.c
        rnd = c.rnd("marina")
        mi0, mi1, mj0, mj1 = MARINA_AGUA
        cantos = {(mi0 - 1, mj1 + 1), (mi1 + 1, mj1 + 1)}
        for q, dagua in sorted(self.marina_orla.items()):
            if q in cantos:
                self.piso(q, "piso_calcada_lisa", tipo="lote")
                continue
            r = {"S": 180, "E": 270, "W": 90, "N": 0}[dagua]
            idd = "cais" if (dagua == "S" and q[0] % 3 == 0) else "orla"
            self.piso(q, idd, tipo="orla", cat="agua", r=r)

    def marina_barcos(self):
        c = self.c
        rnd = c.rnd("marina_barcos")
        mi0, mi1, mj0, mj1 = MARINA_AGUA
        # barcos atracados: fileira junto do calçadão norte e do cais
        barcos = [("barcos", i, w) for i, w in (("iate_cupula_azul", 1), ("iate_flybridge", 1), ("veleiro_branco", 1),
                                                ("veleiro_vela_vermelha", 1), ("lancha_verde_limao", 1),
                                                ("lancha_vermelha", 1), ("veleiro_madeira_verde", 0.8),
                                                ("veleiro_madeira_laranja", 0.8), ("barco_passeio_laranja", 0.6),
                                                ("barco_pesca", 0.5), ("bote_inflavel", 0.4))]
        y_w = Q * (mj1 + 1) + H + 2.0      # face do muro da orla norte (a água fica ao sul)
        xa, xb = Q * mi0 + 5.0, Q * (mi1 + 1) - 5.0
        deque = "deque_madeira_praia" if B.tem("props_praia", "deque_madeira_praia") else None

        def fileira(y_topo, voltado):
            """Píer em pente: dedos de 15 m (deques) a cada 11 m com barcos atracados entre eles."""
            x = xa
            while x + 11 <= xb:
                if deque:
                    c.tenta("props_praia", deque, x, y_topo - 7.6, 0.0, 0, chao=("agua",))
                for k in range(2):
                    esc = c.escolhe(rnd, barcos)
                    lo, hi = B.caixa(*esc)
                    meia = max(-lo[1], hi[1])
                    if meia > 7.0:
                        continue
                    bx = x + 1.3 + 0.3 + (k + 0.5) * 4.2
                    c.tenta(esc[0], esc[1], bx, y_topo - 0.8 - meia, Z_AGUA, voltado if rnd.random() < 0.8 else
                            (voltado + 180) % 360, chao=("agua",))
                x += 11.0
            if deque:
                c.tenta("props_praia", deque, x, y_topo - 7.6, 0.0, 0, chao=("agua",))

        fileira(y_w - 0.2, 180)
        if deque:
            for n_ in (1, 2):
                y2 = y_w - 29.0 * n_
                x = xa
                while x + 7.5 <= xb + 7.5:   # passarela leste-oeste do pente
                    c.tenta("props_praia", deque, x + 7.5, y2, 0.0, 90, chao=("agua",))
                    x += 15.0
                fileira(y2 - 1.4, 0)
                for k in range(2):           # ligação com o calçadão / com o pente de cima
                    c.tenta("props_praia", deque, xa - 3.2, y2 + 1.4 + 7.5 + 15.0 * k - 0.1, 0.0, 0, chao=("agua",))
        # barcos andando (laço na marina e para fora)
        xa, xb = Q * mi0 + 12, Q * (mi1 + 1) - 12
        ya, yb = Q * (mj1 - 7) + 10, Q * (mj1 - 5) + 6
        for k, (bid, vel) in enumerate((("lancha_vermelha", 6.0), ("barco_passeio_azul", 3.5))):
            off = k * 7.0
            rota = [[xa + off, ya + off, Z_AGUA], [xa + off, yb - off, Z_AGUA], [xb - off, yb - off, Z_AGUA],
                    [xb - off, ya + off, Z_AGUA]]
            c.tenta("barcos", bid, rota[0][0], rota[0][1], Z_AGUA, 180, chao=("agua",), rota=rota, vel=vel)
        # gaivotas no calçadão
        for k in range(4):
            q = (mi0 + 1 + k * 3, mj1 + 1)
            x, y = cc(*q)
            c.tenta("bichos", "gaivota" if k % 2 else "pombo", x + rnd.uniform(-5, 5), y + 4.5 - 2.6 - 3.0 + 6.0, 0,
                    rnd.randrange(0, 360, 30), anim="bicar")

    def observatorio(self, d):
        c = self.c
        rnd = c.rnd("obs")
        cels = [q for q in ret_set(d.i0, d.i1, d.j0, d.j1)]
        ob = cen_id("observatorio")
        cels_ob = []
        if ob:
            lo, hi = B.caixa("cenario", ob)
            nx = max(1, math.ceil((hi[0] - lo[0] - 0.1) / Q))
            ny = max(1, math.ceil((hi[1] - lo[1] - 0.1) / Q))
            ic, jc = (d.i0 + d.i1) // 2, d.j0 + 1
            cels_ob = [(ic - nx // 2 + a, jc + b) for a in range(nx) for b in range(ny)]
            cx, cy = self.centro_de(cels_ob)
            if classe("cenario", ob) == "tile":
                for q in cels_ob:
                    self.tipo[q] = "esp"
            else:
                for q in cels_ob:
                    self.piso(q, "piso_praca", tipo="esp")
            c.add("cenario", ob, cx - (hi[0] + lo[0]) / 2, cy - (hi[1] + lo[1]) / 2, 0, 0)
        # represa com vertedouro (agua/represa) descendo para o mar pelo canal, ao norte da ilhota
        if B.tem("agua", "represa"):
            rc = [(3, 32), (3, 33), (3, 34)]
            if all(self.livre(q) for q in rc):
                for q in rc:
                    self.tipo[q] = "esp"
                c.add("agua", "represa", *self.centro_de(rc), 0, 180)
                for j in (35, 36, 37):
                    self.tipo[(3, j)] = "esp"
                    c.add("agua", "canal_reto", *cc(3, j), 0, 0)
        for q in cels:
            if self.livre(q):
                self.piso(q, "piso_grama", tipo="verde")
                self.jardim(q, rnd, "verde", n=rnd.randint(1, 3))

    # ------------------------------------------------------------------------------------------ mobiliário de rua
    RETAS = ("rua_reta", "rua_reta_faixa_pedestres", "rua_lombada", "avenida_reta", "avenida_reta_faixa_pedestres",
             "avenida_canteiro", "avenida_canteiro_inicio", "rua_transicao_avenida")

    def mobiliario(self):
        c = self.c
        for q, (i_, r) in sorted(self.rua_peca.items()):
            x, y = cc(*q)
            est = self.estilo_de(q)
            rnd = c.rnd("mob", q)
            if i_ in self.RETAS:
                self._mob_reta(q, i_, r, est, rnd)
            elif "cruzamento" in i_:
                self._semaforos(q, rnd)

    def _mob_reta(self, q, i_, r, est, rnd):
        c = self.c
        x, y = cc(*q)
        av = i_.startswith("avenida") or i_ == "rua_transicao_avenida"
        ns = r % 180 == 0
        E = ESTILO.get(est, ESTILO["regular"])
        for sx in (-1, 1):
            d_loc = "E" if sx > 0 else "W"
            d_lado = rot_dir(d_loc, r)
            viz = (q[0] + DIRS[d_lado][0], q[1] + DIRS[d_lado][1])
            tv = self.tipo.get(viz)
            if tv in ("mar", "agua", "costa", None):
                continue
            d_rua = rot_dir("W" if sx > 0 else "E", r)  # da calçada para o meio da rua
            for ly in (-3.75, 3.75):
                lx = sx * (6.85 if av else RUA_MF + 0.85)
                dx, dy = rp(lx, ly, r)
                gx, gy = x + dx, y + dy
                k = int(round((gy if ns else gx) / 7.5))
                if k % 4 == 0:
                    if est == "china" and not av and B.tem("props_lazer", "poste_lanternas_chinesas"):
                        c.tenta("props_lazer", "poste_lanternas_chinesas", gx, gy, 0, r + 90)
                    else:
                        c.tenta("mobiliario_urbano", "poste_rua", gx, gy, 0, facing_r(d_rua))
                elif k % 4 == 2 and not av:
                    arv = E["arvores"] if est not in ("regular", "centro") else \
                        [("vegetacao", "palmeira", 1.0)] + ARVORES_RUA
                    esc = c.escolhe(rnd, arv)
                    if esc:
                        c.tenta(esc[0], esc[1], gx, gy, 0, rnd.randrange(0, 360, 30))
                else:
                    u = rnd.random()
                    pequenos = [("vegetacao", "vaso_calcada", 1.0), ("mobiliario_urbano", "hidrante", 0.6),
                                ("mobiliario_urbano", "lixeira_comum", 0.8), ("props_rua", "balizador_fixo", 0.9),
                                ("props_rua", "floreira_concreto_pequena", 0.8),
                                ("props_rua", "floreira_concreto_grande", 0.5), ("props_rua", "parquimetro", 0.3)]
                    if av:
                        pequenos = [("mobiliario_urbano", "hidrante", 1.0), ("mobiliario_urbano", "lixeira_comum", 1.0)]
                    if u < 0.55:
                        esc = c.escolhe(rnd, pequenos)
                        c.tenta(esc[0], esc[1], gx, gy, 0, facing_r(d_rua))
            if av:
                continue
            # fundo da calçada: banco, ponto de ônibus, orelhão, bicicletário, placas
            for ly in (-5.0, 0.0, 5.0):
                if rnd.random() > 0.22:
                    continue
                dx, dy = rp(sx * 6.55, ly, r)
                ops = [("mobiliario_urbano", "banco_praca_madeira", 1.0), ("mobiliario_urbano", "telefone_publico", 0.4),
                       ("mobiliario_urbano", "caixa_correio", 0.4), ("mobiliario_urbano", "bicicletario", 0.5),
                       ("mobiliario_urbano", "lixeira_reciclagem", 0.4), ("sinalizacao", "totem_mapa_calcada", 0.3),
                       ("vegetacao", "floreira_redonda", 0.6), ("mobiliario_urbano", "relogio_rua", 0.2)]
                ops += [("props_rua", "banca_jornal", 0.3), ("props_rua", "maquina_venda_bebidas", 0.3),
                        ("props_rua", "caixa_eletronico_rua", 0.2), ("props_rua", "estacao_bicicletas", 0.3),
                        ("props_rua", "totem_informacao_mapa", 0.2), ("props_rua", "banca_frutas", 0.2)]
                if est in ("futurista", "eco"):
                    ops += [("props_rua", "carregador_carro_eletrico", 0.6)]
                if est == "futurista":
                    ops += [("cenario", "placa_quebra_cabeca", 0.15), ("sinalizacao", "vertical_foguete_voe", 0.6), ("sinalizacao", "vertical_fique_conectado", 0.6),
                            ("sinalizacao", "vertical_show_drones", 0.6), ("sinalizacao", "cavalete_desfile_neon", 0.5)]
                if est in ("eco",):
                    ops += [("sinalizacao", "vertical_pedale_mais", 0.8), ("sinalizacao", "vertical_lixo_zero", 0.5)]
                if ly == 0.0 and rnd.random() < 0.3:
                    ops = [("mobiliario_urbano", "ponto_onibus", 1.0)]
                esc = c.escolhe(rnd, ops)
                if esc:
                    g = facing_r(d_rua)
                    c.tenta(esc[0], esc[1], x + dx, y + dy, 0, g)

    def _semaforos(self, q, rnd):
        c = self.c
        x, y = cc(*q)
        br = self.rede.bracos(q)
        tem_av = "av" in br.values()
        for sx in (-1, 1):
            for sy in (-1, 1):
                dx_ = "E" if sx > 0 else "W"
                dy_ = "N" if sy > 0 else "S"
                if dx_ not in br or dy_ not in br:
                    continue
                pns = br.get("N") or br.get("S")
                pew = br.get("E") or br.get("W")
                ox = (AV_MF + 0.6) if pns == "av" else (RUA_MF + 1.25)
                oy = (AV_MF + 0.6) if pew == "av" else (RUA_MF + 1.25)
                if tem_av:
                    c.tenta("mobiliario_urbano", "traffic_light_001_pacote", x + sx * ox, y + sy * oy, 0,
                            0 if sx < 0 else 180)
                else:
                    c.tenta("mobiliario_urbano", "traffic_light_003_pacote", x + sx * ox, y + sy * oy, 0,
                            0 if sy < 0 else 180)

    # ------------------------------------------------------------------------------------------ veículos
    def rotas_viaduto(self):
        """Carros que sobem a rampa, passam pelo viaduto, descem e voltam pela rua de baixo (laço na mão, à direita)."""
        c = self.c
        rnd = c.rnd("rotas_viaduto")

        def lane(q, d):
            """deslocamento da faixa da direita para quem anda em d na quadra q (rua ou avenida)."""
            br = self.rede.bracos(q)
            return 1.9 if "av" in br.values() else 1.85

        for k, (a, b, js) in enumerate(VIADUTOS):
            (i0, j), (i1, _) = a, b
            yv = cc(i0, j)[1] - 1.85                 # sentido leste: faixa sul
            xw, xe = cc(i0, j)[0] + 1.85, cc(i1, j)[0] - 1.85
            ys = cc(i0, js)[1] + lane((i1, js), "W")
            pts = [[xw, ys, Z_ASF], [xw, yv, Z_ASF]]
            xa = Q * (i0 + 1)
            for t in range(0, 9):                     # rampa oeste (perfil suave das rampas de viaduto)
                u = t / 8
                pts.append([xa + 2 * Q * u, yv, 7.5 * u * u * (3 - 2 * u) - 0.1])
            xb = Q * (i1 - 2)
            for t in range(0, 9):                     # rampa leste
                u = t / 8
                pts.append([xb + 2 * Q * u, yv, 7.5 * (1 - u * u * (3 - 2 * u)) - 0.1])
            pts += [[xe, yv, Z_ASF], [xe, ys, Z_ASF]]
            rota = [[round(v, 3) for v in p_] for p_ in pts]
            frota = ESTILO.get(self.estilo_de(a), ESTILO["regular"])["carros"]
            for n_ in range(2):
                esc = c.escolhe(rnd, frota[:12])
                if not esc:
                    continue
                if n_ == 0:   # um começa na subida da rua oeste
                    ym = round((ys + yv) / 2, 3)
                    c.tenta(esc[0], esc[1], xw, ym, Z_ASF, 180, chao=("asfalto",),
                            rota=[[round(xw, 3), ym, Z_ASF]] + rota[1:] + rota[:1], vel=round(rnd.uniform(7, 10), 1))
                else:         # o outro na volta pela rua de baixo
                    xm = round((xw + xe) / 2, 3)
                    c.tenta(esc[0], esc[1], xm, ys, Z_ASF, 270, chao=("asfalto",),
                            rota=[[xm, round(ys, 3), Z_ASF]] + rota, vel=round(rnd.uniform(7, 10), 1))

    def veiculos(self):
        c = self.c
        self.rotas_viaduto()
        for q, (i_, r) in sorted(self.rua_peca.items()):
            if i_ not in self.RETAS or i_ == "rua_transicao_avenida":
                continue
            rnd = c.rnd("carro", q)
            av = i_.startswith("avenida")
            if rnd.random() > (0.32 if av else 0.22):
                continue
            est = self.estilo_de(q)
            frota = ESTILO.get(est, ESTILO["regular"])["carros"]
            lanes = (-4.7, -1.9, 1.9, 4.7) if av else (-1.85, 1.85)
            lx = rnd.choice(lanes)
            ly = rnd.uniform(-3.5, 3.5)
            dx, dy = rp(lx, ly, r)
            esc = c.escolhe(rnd, frota)
            if esc:
                c.tenta(esc[0], esc[1], cc(*q)[0] + dx, cc(*q)[1] + dy, Z_ASF, r + (180 if lx > 0 else 0),
                        chao=("asfalto",))
        # alguns andando: laço em volta de quarteirões cercados de rua, na mão (sentido horário, faixa da direita)
        n = 0
        for d in DISTRITOS:
            if d.estilo in ("observatorio",):
                continue
            cels = [q for q in ret_set(d.i0, d.i1, d.j0, d.j1) if d.dentro(q) and self.tipo.get(q) != "rua"]
            for k, b in enumerate(self.componentes(cels)):
                ia, ib = min(q[0] for q in b), max(q[0] for q in b)
                ja, jb = min(q[1] for q in b), max(q[1] for q in b)
                if len(b) != (ib - ia + 1) * (jb - ja + 1):
                    continue
                anel = [(i, ja - 1) for i in range(ia - 1, ib + 2)] + [(i, jb + 1) for i in range(ia - 1, ib + 2)] + \
                       [(ia - 1, j) for j in range(ja, jb + 1)] + [(ib + 1, j) for j in range(ja, jb + 1)]
                if not all(v in self.rua_peca for v in anel):
                    continue
                rnd = c.rnd("rota", d.nome, k)
                if rnd.random() > 0.45:
                    continue
                xl, xr = Q * ia - H + 1.85, Q * (ib + 1) + H - 1.85
                yb, yt = Q * ja - H + 1.85, Q * (jb + 1) + H - 1.85
                rota = [[xl, yb, Z_ASF], [xl, yt, Z_ASF], [xr, yt, Z_ASF], [xr, yb, Z_ASF]]
                frota = ESTILO.get(d.estilo, ESTILO["regular"])["carros"]
                esc = c.escolhe(rnd, frota)
                if esc:
                    yy = yb + rnd.uniform(0.25, 0.75) * (yt - yb)
                    p = c.tenta(esc[0], esc[1], xl, yy, Z_ASF, 180, chao=("asfalto",),
                                rota=[[xl, yy, Z_ASF]] + rota[1:] + [rota[0]], vel=round(rnd.uniform(6, 10), 1))
                    n += 1 if p else 0
        self.n_rotas = n

    def barcos_mar(self):
        """Barcos no mar perto da costa (alguns andando em laço)."""
        c = self.c
        rnd = c.rnd("mar")
        frota = [("barcos", i, 1.0) for i in ("veleiro_branco", "veleiro_vela_vermelha", "lancha_verde_limao",
                                              "lancha_vermelha", "iate_flybridge", "barco_pesca", "caiaque",
                                              "barco_passeio_azul", "veleiro_madeira_laranja")]
        costa = [q for q, t in self.tipo.items() if t == "mar" and any(
            self.tipo.get((q[0] + a, q[1] + b)) in ("costa", "areia") for a in (-2, 0, 2) for b in (-2, 0, 2))]
        costa.sort()
        rnd.shuffle(costa)
        for k, q in enumerate(costa[:len(costa) // 6]):
            x, y = cc(*q)
            esc = c.escolhe(rnd, frota)
            kw = {}
            if k % 5 == 0:
                rr = rnd.uniform(14, 26)
                rota = [[round(x + rr * math.cos(a), 2), round(y + rr * math.sin(a), 2), Z_AGUA]
                        for a in [2 * math.pi * t / 32 for t in range(32)]]
                if all(c.mapa.sup(a[0] + dx_, a[1] + dy_)[0] == "agua" for a in rota
                       for dx_, dy_ in ((0, 0), (5, 0), (-5, 0), (0, 5), (0, -5))):
                    kw = dict(rota=rota[::4], vel=round(rnd.uniform(3, 7), 1))
            c.tenta(esc[0], esc[1], x + rnd.uniform(-4, 4), y + rnd.uniform(-4, 4), Z_AGUA, rnd.randrange(0, 360, 15),
                    chao=("agua",), **kw)

    def praia(self):
        """Peças de praia na areia: palmeiras, guarda-sóis, castelo de areia, quiosques, bares, kombis e gaivotas."""
        c = self.c
        rnd = c.rnd("praia")
        areia = sorted(q for q, t in self.tipo.items() if t == "areia")
        perto_dist = [q for q in areia if any(self.tipo.get((q[0] + a, q[1] + b)) == "rua"
                                              for a in (-2, -1, 0, 1, 2) for b in (-2, -1, 0, 1, 2))]
        marcos = [("predios_magicos", "castelo_areia"), ("predios_tropicais", "quiosque_sucos"),
                  ("predios_tropicais", "bar_praia_lilas"), ("predios_tropicais", "cabana_redonda"),
                  ("predios_tropicais", "loja_surfe"), ("predios_tropicais", "sorveteria"),
                  ("predios_tropicais", "bar_barril"), ("predios_tropicais", "bar_praia_turquesa")]
        k = 0
        for q in perto_dist[::5]:
            if k >= len(marcos):
                break
            x, y = cc(*q)
            if c.tenta(*marcos[k], x, y, 0, rnd.randrange(0, 360, 90)):
                k += 1
        gsol = [("props_praia", i, 1.0) for i in ("guarda_sol_praia_azul", "guarda_sol_praia_roxo",
                                                  "guarda_sol_praia_laranja", "guarda_sol_praia_arco_iris",
                                                  "guarda_sol_praia_estrela")] + [("mobiliario_urbano", "guarda_sol", 0.6)]
        miudos = [("props_praia", i, 1.0) for i in ("espreguicadeira_madeira", "espreguicadeira_lona",
                                                    "espreguicadeira_reclinavel", "cadeira_praia_dobravel",
                                                    "toalha_praia_listras", "toalha_praia_melancia", "toalha_praia_ondas",
                                                    "boia_pato", "boia_rosquinha", "castelo_areia_pequeno",
                                                    "prancha_surfe_deitada_azul", "bodyboard_azul", "cesta_piquenique",
                                                    "caixa_termica_praia")]
        grandes = [("props_praia", i, 1.0) for i in ("quiosque_coco_palha", "quiosque_sucos_coco_gigante",
                                                     "quiosque_estacao_surfe", "barraca_acai_abacaxi", "carrinho_picole",
                                                     "barraca_praia_mesa", "suporte_pranchas_surfe",
                                                     "posto_salva_vidas_azul", "posto_salva_vidas_amarelo",
                                                     "chuveirinho_praia", "lixeira_praia", "placa_praia",
                                                     "bandeira_aviso_verde", "rede_volei_praia", "tenda_lona_estrela",
                                                     "mastro_biruta")]
        # marcos da praia na frente do parque de diversões (cena da praia)
        for (qi, qj), (cat, idd, g) in sorted(PRAIA_FIXOS.items()):
            x, y = cc(qi, qj)
            c.tenta(cat, idd, x, y, 0, g)
        for q in perto_dist[2::7][:1]:
            c.tenta("props_praia", "castelo_areia_gigante", *cc(*q), 0, 0)
        for q in areia:
            x, y = cc(*q)
            for t in range(4):
                esc = c.escolhe(rnd, [("vegetacao", "palmeira", 1.0), ("vegetacao", "palm_03_pacote", 0.3)])
                c.tenta(esc[0], esc[1], x + rnd.uniform(-6, 6), y + rnd.uniform(-6, 6), 0, rnd.randrange(0, 360, 30))
                if t < 2:
                    break
            u = rnd.random() * (0.8 if -3 <= q[0] <= 24 else 1.0)
            if u < 0.6:
                # guarda-sol com espreguiçadeiras em volta (estrela)
                gx, gy = x + rnd.uniform(-3, 3), y + rnd.uniform(-3, 3)
                esc = c.escolhe(rnd, gsol)
                if esc and c.tenta(esc[0], esc[1], gx, gy, 0, rnd.randrange(0, 360, 45)):
                    for k in range(rnd.randint(2, 4)):
                        a = rnd.uniform(0, 2 * math.pi)
                        m_ = c.escolhe(rnd, miudos)
                        c.tenta(m_[0], m_[1], gx + 2.0 * math.cos(a), gy + 2.0 * math.sin(a), 0,
                                int(math.degrees(a)) + 90)
            elif u < 0.75:
                esc = c.escolhe(rnd, grandes)
                if esc:
                    c.tenta(esc[0], esc[1], x + rnd.uniform(-3, 3), y + rnd.uniform(-3, 3), 0, rnd.randrange(0, 360, 90))
            if rnd.random() < 0.08:
                c.tenta("bichos", rnd.choice(["gaivota", "pombo", "gaivota"]), x + rnd.uniform(-6, 6),
                        y + rnd.uniform(-6, 6), 0, rnd.randrange(0, 360, 30), anim="bicar")
            if rnd.random() < 0.03:
                esc = c.escolhe(rnd, [("carros", "bugue_laranja", 1), ("utilitarios", "kombi_viagem", 1),
                                      ("utilitarios", "food_truck_sorvete", 1), ("utilitarios", "kombi_rosa", 1)])
                c.tenta(esc[0], esc[1], x, y, 0, rnd.randrange(0, 360, 45))

    def verde(self):
        """Árvores nas quadras de grama soltas (fora dos distritos)."""
        c = self.c
        for q, t in sorted(self.tipo.items()):
            if t == "verde" and q not in self.urb:
                rnd = c.rnd("verde", q)
                if rnd.random() < 0.7:
                    self.jardim(q, rnd, "verde", n=rnd.randint(1, 3))

    def marcos_cenario(self):
        """Píer do cruzeiro com o navio, represa grande, observatório, estádio, hangar e farol (peças do cenário)."""
        c = self.c
        if not B.tem("cenario", "represa_grande_trecho") or not B.tem("cenario", "represa_grande_torre"):
            self.faltando.append("represa grande (trechos)")
        else:
            ex = B.cat["cenario/represa_grande_trecho"].get("extra") or {}
            mont = ex.get("montagem") or (B.cat["cenario/represa_grande_torre"].get("extra") or {}).get("montagem")
            if not mont:   # a montagem de referência de cenario_marcos.extra_represa (R = 220 m)
                R = 220.0
                mont = []
                for a in (-24.0, -8.0, 8.0, 24.0):
                    t = math.radians(a)
                    mont.append({"i": "represa_grande_trecho", "p": [R * math.sin(t), -R + R * math.cos(t)], "r": -a})
                for sg in (-1, 1):
                    a = sg * (32.0 + math.degrees(12.5 / R))
                    t = math.radians(a)
                    mont.append({"i": "represa_grande_torre", "p": [R * math.sin(t), -R + R * math.cos(t)], "r": -a})
            x0, y0, g = REPRESA
            for m_ in mont or []:
                dx, dy = rp(m_["p"][0], m_["p"][1], g)
                c.add("cenario", m_["i"], x0 + dx, y0 + dy, 0, m_["r"] + g)
        for id_ in ("estadio", "aeroporto_hangar", "farol"):
            if not B.tem("cenario", id_):
                self.faltando.append(id_)
        if B.tem("cenario", "farol"):
            for q in ((-4, 35), (-3, 35), (-2, 35), (6, 30), (5, 29)):
                if c.tenta("cenario", "farol", *cc(*q), 0, 0, chao=("livre", "costa")):
                    break

    def esporte(self):
        """Campinho de futebol e pracinha com chafariz no bairro futurista; quadras no ecológico e no leste."""
        c = self.c
        if B.tem("props_esporte", "campo_futebol"):
            cels = [(-31, -15), (-30, -15)]
            if all(self.livre(q) for q in cels):
                for q in cels:
                    self.tipo[q] = "esp"
                c.add("props_esporte", "campo_futebol", *self.centro_de(cels), 0, 0)
                for q, idd in (((-31, -14), "chafariz_lobulos"), ((-30, -14), "chafariz_globo")):
                    self.piso(q, "piso_praca", tipo="praca")
                    c.tenta("props_lazer", idd, *cc(*q), 0, 0)
                    self.praca(q, c.rnd("praca_fut", q), "futurista")
        for q, idd in (((38, 6), "quadra_basquete"), ((16, -1), "quadra_basquete_azul"), ((-11, -4), "quadra_basquete")):
            if B.tem("props_esporte", idd) and self.livre(q) and self.dist_de.get(q) and self.dist_de[q].dentro(q):
                self.tipo[q] = "esp"
                c.add("props_esporte", idd, *cc(*q), 0, 0)

    def marcos_terra(self):
        """Estádio numa quadra 2 × 2 do bairro leste e o hangar do aeroporto na serra do nordeste, com avião no pátio."""
        c = self.c
        if B.tem("cenario", "estadio"):
            cels = sorted(ret_set(13, 14, 5, 6))
            if all(self.livre(q) for q in cels):
                for q in cels:
                    self.tipo[q] = "esp"
                c.add("cenario", "estadio", *self.centro_de(cels), 0, 0)
        if B.tem("cenario", "aeroporto_hangar"):
            cels = sorted(ret_set(44, 45, 25, 26))
            for q in cels:
                self.tipo[q] = "esp"
            c.add("cenario", "aeroporto_hangar", *self.centro_de(cels), 0, 0)
            patio = sorted(ret_set(42, 47, 21, 24))
            for q in patio:
                self.piso(q, "piso_calcada_lisa", tipo="esp")
            c.tenta("aeronaves", "aviao_passageiros_azul", 44.0 * Q + Q, 22.5 * Q + 4, 0, 0)
            c.tenta("aeronaves", "helicoptero_vermelho", 47.0 * Q + 2, 22.0 * Q, 0, 30)
            c.tenta("aeronaves", "aviao_teco_teco_amarelo", 42.5 * Q, 21.8 * Q, 0, 300)

    def pier(self):
        """Píer do cruzeiro saindo da praia para o sul (acesso na costa, píer 2 × 3 e ponta), com o navio atracado."""
        c = self.c
        ids = ("pier_cruzeiro_acesso", "pier_cruzeiro", "pier_cruzeiro_ponta")
        if not all(B.tem("cenario", i) for i in ids):
            self.faltando.append("píer do cruzeiro")
            return
        jc = AREIA_RETS[0][2]  # fileira da costa
        ia = 6
        acesso = "pier_cruzeiro_acesso_areia" if B.tem("cenario", "pier_cruzeiro_acesso_areia") else \
            "pier_cruzeiro_acesso"
        for q in ((ia, jc), (ia + 1, jc)):
            self.tipo[q] = "esp"
            c.add("cenario", acesso, *cc(*q), 0, 180)
        cels = [(ia + a, jc - 1 - b) for a in range(2) for b in range(3)]
        for q in cels:
            self.tipo[q] = "esp"
        cx, cy = self.centro_de(cels)
        c.add("cenario", "pier_cruzeiro", cx, cy, 0, 180)
        cels2 = [(ia, jc - 4), (ia + 1, jc - 4)]
        for q in cels2:
            self.tipo[q] = "esp"
        px, py = self.centro_de(cels2)
        c.add("cenario", "pier_cruzeiro_ponta", px, py, 0, 180)
        nlo, nhi = B.caixa("barcos", "navio_cruzeiro")
        c.add("barcos", "navio_cruzeiro", cx - 15.0 - nhi[0] - 1.2, Q * jc - 2.5 - nhi[1], Z_AGUA, 0)

    def montanhas(self):
        """Montanhas do cenário nas serras (as maiores primeiro), cobrindo quadras inteiras."""
        c = self.c
        rnd = c.rnd("montanhas")
        tipos = [("montanha_enorme", 6, 6), ("montanha_grande", 4, 4), ("montanha_crista", 4, 2),
                 ("montanha_media", 3, 3), ("morro_verde", 2, 2), ("montanha_pequena", 2, 2)]
        cels = sorted(self.serra)
        for id_, nx, ny in tipos:
            if not B.tem("cenario", id_):
                continue
            ordem = cels[:]
            rnd.shuffle(ordem)
            for q in ordem:
                for (ax, ay, g) in ((nx, ny, 0), (ny, nx, 90)):
                    bloco = [(q[0] + a, q[1] + b) for a in range(ax) for b in range(ay)]
                    if all(v in self.serra and v not in self.tipo and v not in self.urb for v in bloco) and \
                            all(self.tipo.get((v[0] + a, v[1] + b)) not in ("rua", "esp") for v in bloco
                                for a in (-1, 0, 1) for b in (-1, 0, 1)):
                        if rnd.random() < 0.5:
                            continue
                        cx, cy = self.centro_de(bloco)
                        c.add("cenario", id_, cx, cy, 0, g + rnd.choice((0, 180)))
                        for v in bloco:
                            self.tipo[v] = "montanha"
                        break

    # ------------------------------------------------------------------------------------------ tudo
    def gera(self):
        self.mascaras()
        self.rede_ruas()
        self.pecas_rua()
        self.viaduto_chao()
        for d in DISTRITOS:
            if d.estilo == "parque":
                self.parque(d)
            elif d.estilo == "diversoes":
                self.diversoes(d)
            elif d.estilo == "observatorio":
                self.observatorio(d)
        self.plato_cristal()
        self.calcadao()
        self.terracos()
        self.vila_magica()
        self.marina()
        self.faltando = []
        self.pier()
        self.marcos_terra()
        self.esporte()
        self.montanhas()
        self.terreno()
        self.c.mapa = Mapa(self.c.pecas)
        self.marina_barcos()
        self.c.mapa = None
        self.lotes()
        self.c.mapa = Mapa(self.c.pecas)
        self.marcos_cenario()
        self.c.mapa = Mapa(self.c.pecas)
        self.mobiliario()
        self.veiculos()
        self.praia()
        self.verde()
        self.barcos_mar()
        return self.c.pecas


# ======================================================================================================================
# Janelas (cenas de área), verificador e gravação
# ======================================================================================================================
def recorta(pecas, i0, j0, n=TAM_JANELA):
    X0, X1, Y0, Y1 = Q * i0, Q * (i0 + n), Q * j0, Q * (j0 + n)
    dentro_q = lambda q: i0 <= q[0] < i0 + n and j0 <= q[1] < j0 + n  # noqa: E731
    out, buracos, buraco_mar = [], set(), set()
    for p in pecas:
        k = classe(p["c"], p["i"])
        if k in ("tile", "elev"):
            cels = cobre(p["c"], p["i"], p["p"][0], p["p"][1], p.get("r", 0))
            if all(dentro_q(q) for q in cels):
                out.append(p)
            elif k == "tile":
                buracos |= {q for q in cels if dentro_q(q)}
                if p["i"] in ("mar_grande", "mar", "pier_cruzeiro", "pier_cruzeiro_ponta"):
                    buraco_mar |= {q for q in cels if dentro_q(q)}
            continue
        if "rota" in p:
            if not all(X0 + 1 <= a[0] <= X1 - 1 and Y0 + 1 <= a[1] <= Y1 - 1 for a in p["rota"]):
                continue
        ok = True
        for poly, z0, z1 in volumes(p):
            if z0 > p["p"][2] + 3.5 and classe(p["c"], p["i"]) == "poste":
                continue
            for x, y in poly:
                if not (X0 - 0.05 <= x <= X1 + 0.05 and Y0 - 0.05 <= y <= Y1 + 0.05):
                    ok = False
        if ok:
            out.append(p)
    for q in sorted(buracos):
        if q in buraco_mar and B.tem("cenario", "mar"):
            out.append({"c": "cenario", "i": "mar", "p": [cc(*q)[0], cc(*q)[1], 0.0], "r": 0})
        else:
            out.append({"c": "pisos", "i": "piso_grama", "p": [cc(*q)[0], cc(*q)[1], 0.0], "r": 0})
    # tira o que perdeu o chão
    m = Mapa(out)
    final = []
    for p in out:
        if classe(p["c"], p["i"]) in ("tile", "elev"):
            final.append(p)
            continue
        if all(m.sup(x, y)[0] is not None for poly, z0, z1 in volumes(p) if z0 <= p["p"][2] + 2 for x, y in poly):
            final.append(p)
    return final


CHAO_OBJ = {"veiculo": ("asfalto", "estacionamento", "livre"), "barco": ("agua",), "bicho": ("livre", "calcada", "area", "caminho"),
            "aereo": None}


def verifica(cena, bounds=None, detalhe=False):
    """Confere: peças nos catálogos, chão sem buraco nem sobreposição, nada sobre a rua, nada sobreposto, nada
    flutuando, tudo dentro da cena e as rotas no asfalto. Devolve a lista de problemas."""
    pecas = cena["pecas"]
    prob = []
    for p in pecas:
        if not B.tem(p["c"], p["i"]):
            prob.append(("catalogo", p["c"], p["i"]))
    pecas = [p for p in pecas if B.tem(p["c"], p["i"])]
    m = Mapa(pecas)
    for q, a, b in m.dup:
        prob.append(("chao_sobreposto", q, pecas[a]["i"], pecas[b]["i"]))
    if bounds:
        i0, j0, n_i, n_j = bounds
        for i in range(i0, i0 + n_i):
            for j in range(j0, j0 + n_j):
                if (i, j) not in m.chao:
                    prob.append(("chao_buraco", (i, j)))
        X0, X1, Y0, Y1 = Q * i0, Q * (i0 + n_i), Q * j0, Q * (j0 + n_j)
    for p in pecas:
        k = classe(p["c"], p["i"])
        if k in ("tile", "elev") and abs(p["p"][2]) > 0.001:
            # só vale o que está apoiado no alto de um platô (rua e praça em z = 3,75 sobre plato_topo)
            cels = cobre(p["c"], p["i"], p["p"][0], p["p"][1], p.get("r", 0))
            ok = abs(p["p"][2] - Z_PLATO) < 0.01 and all(
                q in m.chao and pecas[m.chao[q]]["i"] == "plato_topo" for q in cels)
            ok = ok or (p["i"] == "plato_topo" and abs(p["p"][2] - Z_SOB_PLATO) < 0.01 and all(q in m.topo for q in cels))
            if not ok:
                prob.append(("chao_fora_do_nivel", p["i"], p["p"]))
    # objetos
    objs = [(n, p) for n, p in enumerate(pecas) if classe(p["c"], p["i"]) not in ("tile", "elev")]
    idx = defaultdict(list)
    vols = {}
    for n, p in objs:
        k = classe(p["c"], p["i"])
        vs = volumes(p)
        vols[n] = vs
        z = p["p"][2]
        elev = m.tem_elev(p["p"][0], p["p"][1]) and z > 5
        permit = CHAO_OBJ.get(k, ("calcada", "livre"))
        if p["i"] in ("chafariz_praca", "fountain_03_pacote"):
            permit = ("calcada", "livre", "caminho")
        if p["i"] == "deque_madeira_praia":
            permit = ("agua", "livre", "costa", "calcada")
        if p["i"].startswith(("represa_grande", "farol")):
            permit = ("agua", "costa", "livre", "area", "calcada")
        for poly, z0, z1 in vs:
            if bounds:
                for x, y in poly:
                    if not (X0 - 0.06 <= x <= X1 + 0.06 and Y0 - 0.06 <= y <= Y1 + 0.06) and not (
                            k == "poste" and z0 > z + 3.5):
                        prob.append(("fora_da_cena", p["i"], p["p"]))
                        break
            if z0 > z + 2.0 or permit is None or elev:
                continue
            ruins = set()
            for x, y in amostras(poly, 0.6):
                s, t = m.sup(x, y)
                if s not in permit:
                    ruins.add(s)
            if ruins:
                prob.append(("chao_errado", p["i"], p["p"], sorted(map(str, ruins))))
        # flutuando / enterrado
        s0, _, h0 = m.sup3(p["p"][0], p["p"][1])
        esperado = h0
        if k == "veiculo":
            esperado = Z_ELEV if elev else (h0 if s0 == "livre" else h0 + Z_ASF)
        elif k == "barco":
            esperado = Z_AGUA
        elif k == "bicho":
            esperado = None
        if esperado is not None and abs(z - esperado) > 0.03:
            prob.append(("flutua_ou_afunda", p["i"], p["p"], esperado))
        for poly, z0, z1 in vs:
            x0, y0, x1, y1 = aabb(poly)
            for a in range(int(math.floor(x0 / 5)), int(math.floor(x1 / 5)) + 1):
                for b in range(int(math.floor(y0 / 5)), int(math.floor(y1 / 5)) + 1):
                    idx[(a, b)].append((n, poly, z0, z1))
    vistos = set()
    for lst in idx.values():
        for a in range(len(lst)):
            for b in range(a + 1, len(lst)):
                na, pa, za0, za1 = lst[a]
                nb, pb, zb0, zb1 = lst[b]
                if na == nb or (na, nb) in vistos:
                    continue
                if pecas[na]["i"].startswith("represa_grande") and pecas[nb]["i"].startswith("represa_grande"):
                    continue
                if za0 < zb1 - 0.01 and zb0 < za1 - 0.01 and sobrepoe(pa, pb):
                    vistos.add((na, nb))
                    prob.append(("sobreposto", pecas[na]["i"], pecas[na]["p"], pecas[nb]["i"], pecas[nb]["p"]))
    # elevados: o que é alto não pode furar o tabuleiro (vale também para o chão de viaduto)
    for n, p in objs:
        z = p["p"][2]
        for poly, z0, z1 in vols[n]:
            if z0 < 6.0 < z1 and z < 3:
                for x, y in poly:
                    if m.tem_elev(x, y):
                        prob.append(("fura_tabuleiro", p["i"], p["p"]))
                        break
    for n, p in objs:
        if "rota" in p:
            pts = p["rota"] + [p["rota"][0]]
            k = classe(p["c"], p["i"])
            alvo = ("asfalto",) if k == "veiculo" else ("agua",)
            for (xa, ya, za), (xb, yb, zb) in zip(pts, pts[1:]):
                L = math.hypot(xb - xa, yb - ya)
                for t in range(int(L / 1.0) + 1):
                    u = t / max(1, int(L / 1.0))
                    xs, ys, zs = xa + (xb - xa) * u, ya + (yb - ya) * u, za + (zb - za) * u
                    s, tp = m.sup(xs, ys)
                    if k == "veiculo" and zs > 0.3:   # subindo a rampa ou no tabuleiro do viaduto
                        if m.tem_elev(xs, ys) or (tp and tp["i"].startswith("rampa_viaduto")):
                            continue
                        s = "fora_do_elevado"
                    elif k == "veiculo" and tp and tp["i"].startswith("rampa_viaduto"):
                        continue
                    if s not in alvo:
                        prob.append(("rota_fora", p["i"], p["p"], s))
                        break
                else:
                    continue
                break
    return prob


def camera_para(alvo, tam, d=(0.55, -1.0, 0.95)):
    n = math.sqrt(sum(v * v for v in d))
    d = [v / n for v in d]
    dist = tam * 1.6 + 200
    return {"alvo": [round(v, 2) for v in alvo], "posicao": [round(alvo[k] + d[k] * dist, 2) for k in range(3)],
            "ortho": round(tam * 1.42, 1)}


def limpa_peca(p):
    out = {k: v for k, v in p.items() if not k.startswith("_")}
    out["p"] = [round(v, 3) for v in out["p"]]
    if "rota" in out:
        out["rota"] = [[round(v, 3) for v in a] for a in out["rota"]]
    return out


DESCR = {
    "chinatown": "Quadras densas de pagodes e prédios com beirais e telões, a praça do cristal no miolo, o viaduto "
                 "cortando o bairro e as casinhas de conto de fadas na grama a oeste.",
    "centro": "O bairro regular com os arranha-céus juntos no meio, a avenida com canteiro, apartamentos, escritórios "
              "com telões e lojas de esquina.",
    "parque": "O parque grande: castelo rosa, parque aquático, montanha-russa de loopings, palco de festival, lago, "
              "zoológico, casa na árvore, tendas de circo e caminhos com postes de quatro lâmpadas.",
    "praia": "A praia com o parque de diversões (montanha-russa do dragão, roda-gigante, carrossel), hotéis na orla, "
             "areia com guarda-sóis e o píer do navio de cruzeiro.",
    "marina": "O braço de mar com o calçadão, o cais e os barcos atracados e andando, com prédios regulares atrás.",
    "ecologico": "A ilha do bairro ecológico, com torres de terraços verdes, casas com painel solar, a orla de areia e "
                 "a ponte em laço chegando.",
    "futurista": "A ilha do bairro futurista: prédios-cápsula, boates, fliperama, torres de neon e a ponte estaiada.",
    "observatorio_represa": "A ilhota do observatório ligada à cidade pela ponte de agulha.",
    "cidade": "A cidade de exemplo completa (~1.600 × 1.200 m): todas as áreas nos lugares da planta, as pontes "
              "entre as ilhas, o mar, as montanhas e os barcos.",
}


def gera_tudo(saida, ids=None):
    cid = Cidade()
    pecas = cid.gera()
    pasta = os.path.join(saida, "cenas")
    os.makedirs(pasta, exist_ok=True)
    rel = {}
    alvo = ids or (list(JANELAS) + ["cidade"])
    for cid_ in alvo:
        if cid_ == "cidade":
            sel = pecas
            xs = [p["p"][0] for p in sel]
            ys = [p["p"][1] for p in sel]
            ctr = [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2]
            tam = [Q * (CIDADE_I[1] - CIDADE_I[0]), Q * (CIDADE_J[1] - CIDADE_J[0])]
            bounds = (CIDADE_I[0], CIDADE_J[0], CIDADE_I[1] - CIDADE_I[0], CIDADE_J[1] - CIDADE_J[0])
            rot = "Cidade completa"
            cam = {"alvo": [10, -10, 0], "posicao": [1160, -2090, 2000], "ortho": 2200}
        else:
            rot, (i0, j0) = JANELAS[cid_]
            sel = recorta(pecas, i0, j0)
            ctr = [Q * (i0 + TAM_JANELA / 2), Q * (j0 + TAM_JANELA / 2)]
            tam = [Q * TAM_JANELA] * 2
            bounds = (i0, j0, TAM_JANELA, TAM_JANELA)
            cam = camera_para([ctr[0], ctr[1], 58.0 if cid_ == "centro" else 12.0], Q * TAM_JANELA * (1.3 if cid_ == "centro"
                                                                                                   else 1.0))
        cena = {"id": cid_, "rotulo": rot, "descricao": DESCR.get(cid_, ""), "tamanho": tam,
                "centro": [round(v, 2) for v in ctr], "camera": cam, "pecas": [limpa_peca(p) for p in sel]}
        prob = verifica(cena, bounds)
        cena["verificacao"] = {"problemas": len(prob)}
        json.dump(cena, open(os.path.join(pasta, cid_ + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
        rel[cid_] = (len(sel), prob)
        print(f"{cid_}: {len(sel)} peças, {len(prob)} problemas", flush=True)
        for pr in prob[:25]:
            print("   ", pr)
    if getattr(cid, "faltando", None):
        print("faltando no cenário:", ", ".join(cid.faltando))
    print("rotas de carro:", getattr(cid, "n_rotas", 0))
    return rel


def main_layout(argv):
    global B
    saida = argv[0]
    B = Biblioteca(saida)
    cmd = argv[1] if len(argv) > 1 else "layout"
    ids = [a for a in argv[2:] if not a.startswith("--")]
    if cmd == "layout":
        gera_tudo(saida, ids or None)
    elif cmd == "verifica":
        for f in sorted(glob.glob(os.path.join(saida, "cenas", "*.json"))):
            cena = json.load(open(f))
            if ids and cena["id"] not in ids:
                continue
            if cena["id"] == "cidade":
                b = (CIDADE_I[0], CIDADE_J[0], CIDADE_I[1] - CIDADE_I[0], CIDADE_J[1] - CIDADE_J[0])
            else:
                i0, j0 = JANELAS[cena["id"]][1]
                b = (i0, j0, TAM_JANELA, TAM_JANELA)
            prob = verifica(cena, b)
            print(cena["id"], len(cena["pecas"]), "peças,", len(prob), "problemas")
            for pr in prob[:40]:
                print("   ", pr)


# ======================================================================================================================
# Montagem no Blender: cada GLB entra uma vez numa coleção da biblioteca (fora da camada de vista) e as peças são
# instâncias dessa coleção (cópias ligadas). Luzes das lâmpadas entram na coleção da peça (aparecem só à noite).
# ======================================================================================================================
LAMPADAS = {"poste_rua": (160.0, 6.0), "poste_praca_4_lanternas": (70.0, 4.0), "spotlight_01_pacote": (160.0, 6.0),
            "poste_lanternas_chinesas": (60.0, 3.0), "varal_lampadas_15m": (40.0, 3.0), "varal_lampadas_10m": (30.0, 3.0),
            "spotlight_02_pacote": (120.0, 6.0), "luminaria_jardim": (15.0, 2.0), "relogio_rua": (20.0, 3.0)}


def _arquivo(c, i):
    if c == "bichos":
        g = B.bichos[i]["grupo"]
        return os.path.join(SP, "pets", g, "glb", i + ".glb")
    return os.path.join(B.saida, c, "glb", i + ".glb")


def monta_blender(cena):
    import bpy
    from mathutils import Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    bib = bpy.data.collections.new("biblioteca")
    scn.collection.children.link(bib)
    pecas_col = bpy.data.collections.new("cena")
    scn.collection.children.link(pecas_col)
    libs = {}
    luzes = []
    usados = sorted({(p["c"], p["i"]) for p in cena["pecas"]})
    for n, (c, i) in enumerate(usados):
        arq = _arquivo(c, i)
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=arq)
        novos = [o for o in bpy.data.objects if o not in antes]
        col = bpy.data.collections.new(f"{c}:{i}")
        bib.children.link(col)
        for o in novos:
            if o.get("colisao") or "colisao" in o.name.lower():
                bpy.data.objects.remove(o, do_unlink=True)
                continue
            for uc in list(o.users_collection):
                uc.objects.unlink(o)
            col.objects.link(o)
        if i in LAMPADAS:
            pts = []
            for o in col.objects:
                if o.type != "MESH":
                    continue
                mats = [m.name.split(".")[0] if m else "" for m in o.data.materials]
                for f in o.data.polygons:
                    if f.material_index < len(mats) and mats[f.material_index] == "luz":
                        pts.append(o.matrix_world @ f.center)
            if pts:
                cen = sum(pts, Vector()) / len(pts)
                forca, raio = LAMPADAS[i]
                ld = bpy.data.lights.new("lamp_" + i, "POINT")
                ld.energy = forca
                ld.color = (1.0, 0.78, 0.45)
                ld.shadow_soft_size = 0.25
                ld.use_shadow = False
                lo = bpy.data.objects.new("lamp_" + i, ld)
                lo.location = cen - Vector((0, 0, 0.25))
                col.objects.link(lo)
                luzes.append(lo)
        libs[(c, i)] = col
        if n % 40 == 0:
            print("importados", n, "/", len(usados), flush=True)
    for lc in bpy.context.view_layer.layer_collection.children:
        if lc.name == "biblioteca":
            lc.exclude = True
    for k, p in enumerate(cena["pecas"]):
        inst = bpy.data.objects.new(p["i"], None)
        inst.instance_type = "COLLECTION"
        inst.instance_collection = libs[(p["c"], p["i"])]
        inst.location = p["p"]
        inst.rotation_euler = (0, 0, math.radians(p.get("r", 0)))
        s = p.get("s", 1.0)
        inst.scale = (s, s, s)
        pecas_col.objects.link(inst)
    print("instâncias", len(cena["pecas"]), "de", len(usados), "peças", flush=True)
    return luzes


def ambiente(cena, noite, luzes, vista=None, res=(1600, 1000), amostras=32):
    import bpy
    import bmesh
    from mathutils import Vector
    import moveis_base as mb
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = amostras
    scn.cycles.use_denoising = True
    scn.cycles.max_bounces = 4
    scn.cycles.transparent_max_bounces = 6
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.view_settings.view_transform = "Standard"
    scn.view_settings.look = "None"
    scn.view_settings.exposure = 0.0
    w = bpy.data.worlds.get("mundo_cena") or bpy.data.worlds.new("mundo_cena")
    scn.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*mb._lin("#0C1530" if noite else "#A9C4E8"), 1)
    bg.inputs[1].default_value = 0.22 if noite else 0.75
    mb.emissao_janelas(mb.JANELA_FORCA * 1.6 if noite else 0.0)
    agua_noite(noite)
    for lo in luzes:
        lo.hide_render = not noite
    # mar de fundo (continua a lâmina d'água além da cena)
    if "mar_fundo" not in bpy.data.objects:
        me = bpy.data.meshes.new("mar_fundo")
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6000)
        bm.to_mesh(me)
        bm.free()
        m = bpy.data.materials.new("mar_fundo")
        m.use_nodes = True
        me.materials.append(m)
        ob = bpy.data.objects.new("mar_fundo", me)
        scn.collection.objects.link(ob)
        ob.location = (cena["centro"][0], cena["centro"][1], -1.06)
    m = bpy.data.materials["mar_fundo"]
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*mb._lin("#08142E" if noite else "#3A9BE0"), 1)
    b.inputs["Roughness"].default_value = 0.25
    sol = bpy.data.objects.get("sol")
    if not sol:
        ld = bpy.data.lights.new("sol", "SUN")
        sol = bpy.data.objects.new("sol", ld)
        scn.collection.objects.link(sol)
    sol.data.energy = 0.35 if noite else 3.4
    sol.data.color = (0.55, 0.65, 1.0) if noite else (1.0, 0.97, 0.9)
    sol.data.angle = math.radians(5)
    sol.rotation_euler = (math.radians(40), 0, math.radians(-35))
    cam = bpy.data.objects.get("camera")
    if not cam:
        cd = bpy.data.cameras.new("camera")
        cam = bpy.data.objects.new("camera", cd)
        scn.collection.objects.link(cam)
    scn.camera = cam
    v = vista or cena["camera"]
    alvo, pos = Vector(v["alvo"]), Vector(v["posicao"])
    cam.location = pos
    cam.rotation_euler = (alvo - pos).to_track_quat("-Z", "Y").to_euler()
    if v.get("ortho"):
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = v["ortho"]
    else:
        cam.data.type = "PERSP"
        cam.data.lens = v.get("lente", 35)
    cam.data.clip_start = 1.0
    cam.data.clip_end = 20000
    return scn


_AGUA_DIA = {}


def agua_noite(noite):
    """À noite a lâmina d'água (mar, orla, costa, lago, canal: os materiais "agua" dos GLB) fica azul-marinho quase
    preta, como na referência noturna; de dia volta ao que veio no GLB. Os GLB não mudam."""
    import bpy
    import moveis_base as mb
    for m in bpy.data.materials:
        if m.name.split(".")[0] != "agua" or not m.use_nodes:
            continue
        b = m.node_tree.nodes.get("Principled BSDF")
        if not b:
            continue
        if m.name not in _AGUA_DIA:
            _AGUA_DIA[m.name] = (tuple(b.inputs["Base Color"].default_value), b.inputs["Alpha"].default_value,
                                 b.inputs["Roughness"].default_value)
        cor, alfa, rug = _AGUA_DIA[m.name]
        if noite:
            b.inputs["Base Color"].default_value = (*mb._lin("#0A1530"), 1)
            b.inputs["Alpha"].default_value = 0.97
            b.inputs["Roughness"].default_value = 0.12
        else:
            b.inputs["Base Color"].default_value = cor
            b.inputs["Alpha"].default_value = alfa
            b.inputs["Roughness"].default_value = rug


VISTAS_CIDADE = {
    "vista_planta": {"alvo": [10, -10, 0], "posicao": [1160, -2090, 2000], "ortho": 2200},
    "vista_dia": {"alvo": [60, 40, 0], "posicao": [-1150, -420, 820], "lente": 28},
    "vista_centro": {"alvo": [-90, 40, 25], "posicao": [-520, -330, 300], "lente": 30},
}


def main_monta(argv):
    import bpy
    global B
    saida, _, id_ = argv[:3]
    B = Biblioteca(saida)
    resto = argv[3:]
    modos = [a for a in resto if a in ("dia", "noite", "blend")] or ["blend", "dia", "noite"]
    res = (1600, 1000)
    amostras = 32
    previa = "--previa" in resto
    for k, a in enumerate(resto):
        if a == "--res":
            res = tuple(int(v) for v in resto[k + 1].split("x"))
        if a == "--amostras":
            amostras = int(resto[k + 1])
        if a == "--olho":   # depuração: --olho px,py,pz,ax,ay,az,lente
            v = [float(t) for t in resto[k + 1].split(",")]
            VISTAS_CIDADE["vista_olho"] = {"posicao": v[:3], "alvo": v[3:6], "lente": v[6]}
    if previa:
        res, amostras = (900, 560), 12
    vistas = [a for a in resto if a.startswith("vista_")]
    pasta = os.path.join(saida, "cenas")
    cena = json.load(open(os.path.join(pasta, id_ + ".json")))
    sys.path.insert(0, AQUI)
    luzes = monta_blender(cena)
    if "blend" in modos:
        ambiente(cena, False, luzes, res=res, amostras=amostras)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(pasta, id_ + ".blend"), compress=True)
        print("blend", id_, flush=True)
    suf = "_previa" if previa else ""
    for md in [m for m in modos if m in ("dia", "noite")]:
        alvos = [] if "--so_vistas" in resto else [(None, f"{id_}_{md}{suf}.png")]
        alvos += [(VISTAS_CIDADE[vn], f"{id_}_{vn}_{md}{suf}.png") for vn in vistas]
        for vista, nome in alvos:
            scn = ambiente(cena, md == "noite", luzes, vista=vista, res=res, amostras=amostras)
            scn.render.image_settings.file_format = "PNG"
            scn.render.filepath = os.path.join(pasta, nome)
            bpy.ops.render.render(write_still=True)
            print("render", nome, flush=True)


if __name__ == "__main__":
    _argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    if len(_argv) > 1 and _argv[1] == "monta":
        main_monta(_argv)
    else:
        main_layout(_argv)
