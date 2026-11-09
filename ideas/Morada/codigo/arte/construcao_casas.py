"""Monta casas inteiras com as peças da biblioteca de construção (construcao.json + portas_janelas.json), para os testes
de encaixe e as vitrines: paredes nos trechos (como construcao_cena.py, com a altura do andar), chão, fundação, laje,
cinta, telhados (montadores de duas águas, quatro águas, mansarda, meia-água e platibanda em retângulo, L e T),
escadas, varanda, cercas, piscina e lote. As texturas entram pelo nome do material.

As regras de montagem estão nas funções "telhado_*", "beirais", "andar" e "paredes" deste arquivo: servem de receita
para montar casas prontas.

Uso: blender-venv/bin/python -I construcao_casas.py -- <pasta da construcao> <saida> <cena> [dia|noite|perto|mede|vitrine]
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

V = Vector
DIR = {"L": 0, "N": 90, "O": 180, "S": 270}
DV = {"L": (1, 0), "N": (0, 1), "O": (-1, 0), "S": (0, -1)}
ANDAR, ALT, LAJE, MEIA, BEIRAL = 3.2, 3.0, 0.2, 0.075, 0.5


def _lin(h):
    h = h.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


class Cena:
    def __init__(self, pasta):
        self.pasta = pasta
        self.cat = json.load(open(os.path.join(pasta, "construcao.json")))
        self.pj = json.load(open(os.path.join(pasta, "portas_janelas.json")))
        self.tex = json.load(open(os.path.join(pasta, "texturas", "texturas.json")))
        self.itens = {}
        for k, v in self.cat.items():
            if isinstance(v, list):
                for x in v:
                    if isinstance(x, dict) and "id" in x:
                        self.itens[x["id"]] = x
        for g in ("janelas", "portas", "batentes", "lambris", "cantos"):
            for x in self.pj[g]:
                self.itens[x["id"]] = x
        self.fontes = {}
        self.mats = {}
        self.objs = []
        cf = bpy.data.collections.new("fontes")
        bpy.context.scene.collection.children.link(cf)
        self.cf = cf
        self.media = {t["id"]: t["media"] for u in ("piso", "parede", "telhado") for t in self.tex.get(u, [])}
        self.registro = []  # cada peça posta (a página monta as mesmas casas com isto)

    # ------------------------------------------------------------------ materiais
    def mat_tex(self, tex, rug=0.72):
        nome = "m_" + tex
        if nome in self.mats:
            return self.mats[nome]
        m = bpy.data.materials.new(nome)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Roughness"].default_value = rug
        if tex.startswith("#"):
            b.inputs["Base Color"].default_value = (*_lin(tex), 1)
        else:
            tx = m.node_tree.nodes.new("ShaderNodeTexImage")
            tx.image = bpy.data.images.load(os.path.join(self.pasta, "texturas", tex + ".png"), check_existing=True)
            tx.interpolation = "Cubic"
            m.node_tree.links.new(tx.outputs["Color"], b.inputs["Base Color"])
        self.mats[nome] = m
        return m

    def cor_cumeeira(self, tex):
        h = self.media.get(tex, "#a84a2a").lstrip("#")
        c = [int(h[i:i + 2], 16) * 0.78 for i in (0, 2, 4)]
        return self.mat_tex("#%02x%02x%02x" % tuple(int(x) for x in c), 0.55)

    # ------------------------------------------------------------------ peças
    def fonte(self, iid):
        if iid in self.fontes:
            return self.fontes[iid]
        it = self.itens[iid]
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(self.pasta, it["arquivo"]))
        novos = [o for o in bpy.data.objects if o not in antes]
        for o in novos:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            self.cf.objects.link(o)
            o.hide_render = True
            o.hide_viewport = True
        raiz = [o for o in novos if o.parent is None][0]
        self.fontes[iid] = raiz
        return raiz

    def poe(self, iid, x, y, z=0.0, giro=0.0, mats=None, esc_z=None, abre=0.0):
        raiz = self.fonte(iid)
        tp = self.itens[iid].get("texturas_padrao")
        if mats is None and tp:  # sem materiais pedidos: as texturas padrão da peça
            mats = {k: self.mat_tex(v, 0.62) for k, v in tp.items()}
            if "telha" in tp:
                mats["cumeeira"] = self.cor_cumeeira(tp["telha"])
        criados = []

        def dup(o, pai):
            c = o.copy()
            bpy.context.scene.collection.objects.link(c)
            c.hide_render = bool(o.get("colisao"))
            c.hide_viewport = False
            if pai is not None:
                c.parent = pai
                c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
            criados.append(c)
            if c.type == "MESH" and mats:
                for i, s in enumerate(c.material_slots):
                    nome = (s.material.name if s.material else "").split(".")[0]
                    novo = mats.get(nome)
                    if novo is not None:
                        s.link = "OBJECT"
                        s.material = novo
            if abre and o.get("interativo"):
                if o["interativo"] == "porta":
                    ax = V(o["eixo"])
                    c.rotation_mode = "AXIS_ANGLE"
                    c.rotation_axis_angle = (o["angulo"] * abre, ax[0], -ax[2], ax[1])
                elif o["interativo"] in ("gaveta", "correr"):
                    d = V(o["direcao"])
                    c.location = c.location + V((d[0], -d[2], d[1])) * o["curso"] * abre
            for ch in o.children:
                dup(ch, c)
            return c
        r = dup(raiz, None)
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(giro), 4, "Z")
        if esc_z:
            M = M @ Matrix.Diagonal((1, 1, esc_z, 1))
        r.matrix_world = M
        self.objs += criados
        self.registro.append({"id": iid, "p": [round(x, 4), round(y, 4), round(z, 4)], "g": round(giro % 360, 2),
                              **({"m": {k: v.name[2:] for k, v in mats.items() if v is not None}} if mats else {}),
                              **({"ez": round(esc_z, 5)} if esc_z else {})})
        return r

    # ------------------------------------------------------------------ paredes (a regra de construcao_cena.py)
    def paredes(self, trechos, z=0.0, lambri=False):
        """trechos: [(ponto inicial, direção, [peça ou (peça, encaixe)], textura de dentro, textura de fora)]. Contorno
        anti-horário: o lado de dentro fica à esquerda. Cantoneira só nos cantos e nas pontas soltas."""
        comp = {p["id"]: p["comp"] for p in self.cat["paredes"]}
        comp.update({p["id"]: p["comp"] for p in self.cat.get("telhados", []) if p["id"].startswith("parede_")})
        alt = {p["id"]: p["alt"] for p in self.cat["paredes"]}
        alt.update({p["id"]: p["alt"] for p in self.cat.get("telhados", []) if p["id"].startswith("parede_")})
        vaos = {p["id"]: p.get("vaos", []) for p in self.cat["paredes"]}
        cantos, ends, retas = {}, {}, set()
        for (x, y), d, pecas, dentro, fora in trechos:
            mats = {"face_a": self.mat_tex(dentro), "face_b": self.mat_tex(fora)}
            dx, dy = DV[d]
            px, py = x, y
            p0 = pecas[0][0] if isinstance(pecas[0], tuple) else pecas[0]
            ch = (round(x, 3), round(y, 3))
            cantos[ch] = max(cantos.get(ch, 0), alt.get(p0, 3.0))
            for q in pecas:
                pid, enc = (q if isinstance(q, tuple) else (q, None))
                self.poe(pid, px, py, z, DIR[d], mats)
                if enc:
                    cx = vaos[pid][0]["cx"]
                    self.poe(enc, px + dx * cx, py + dy * cx, z, DIR[d])
                    bat = self.itens[enc].get("batente")
                    if bat:
                        self.poe(bat, px + dx * cx, py + dy * cx, z, DIR[d])
                px += dx * comp[pid]
                py += dy * comp[pid]
            ch = (round(px, 3), round(py, 3))
            cantos[ch] = max(cantos.get(ch, 0), alt.get(pid, 3.0))
            L = math.hypot(px - x, py - y)
            ends.setdefault((round(x, 3), round(y, 3)), []).append(d)
            ends.setdefault(ch, []).append({"L": "O", "O": "L", "N": "S", "S": "N"}[d])
            for s in range(1, int(round(L / 0.5))):
                retas.add((round(x + dx * s * 0.5, 3), round(y + dy * s * 0.5, 3)))
        for pt, ds in ends.items():
            if ("L" in ds and "O" in ds) or ("N" in ds and "S" in ds):
                retas.add(pt)
        for (x, y), h in cantos.items():
            if (x, y) not in retas:
                self.poe("pilar", x, y, z, 0, esc_z=(h + 0.004) / 3.004)

    def chao(self, x0, y0, x1, y1, z, tex):
        """Cobre o retângulo com chão de 4 × 4 (e 4 × 2, 2 × 2 nas sobras)."""
        m = {"piso": self.mat_tex(tex, 0.6)}
        y = y0
        while y < y1 - 1e-6:
            hy = 4 if y1 - y >= 4 else 2
            x = x0
            while x < x1 - 1e-6:
                hx = 4 if x1 - x >= 4 else 2
                if hx == 4 and hy == 4:
                    self.poe("chao_4m", x, y, z, 0, m)
                elif hx == 4:
                    self.poe("chao_4x2m", x, y, z, 0, m)
                elif hy == 4:
                    self.poe("chao_4x2m", x + 2, y, z, 90, m)
                else:
                    self.poe("chao_2x2m", x, y, z, 0, m)
                x += hx
            y += hy

    def lajes(self, x0, y0, x1, y1, z, tex, abertura=None):
        """Laje do andar (topo em z) cobrindo o retângulo; abertura = (id da laje com abertura, x, y, giro)."""
        m = {"piso": self.mat_tex(tex, 0.6)}
        tomado = None
        if abertura:
            lid, ax, ay, g = abertura
            self.poe(lid, ax, ay, z, g, m)
            tomado = (ax, ay)
        y = y0
        while y < y1 - 1e-6:
            hy = 4 if y1 - y >= 4 else 2
            x = x0
            while x < x1 - 1e-6:
                hx = 4 if x1 - x >= 4 else 2
                if tomado and abs(x - tomado[0]) < 1e-6 and abs(y - tomado[1]) < 1e-6:
                    x += hx
                    continue
                if hx == 4 and hy == 4:
                    self.poe("laje_4m", x, y, z, 0, m)
                elif hx == 4:
                    self.poe("laje_4x2m", x, y, z, 0, m)
                elif hy == 4:
                    self.poe("laje_4x2m", x + 2, y, z, 90, m)
                else:
                    self.poe("laje_2x2m", x, y, z, 0, m)
                x += hx
            y += hy

    # ------------------------------------------------------------------ contornos (anti-horário)
    @staticmethod
    def lados(contorno):
        """[(a, b, direção)] de um contorno anti-horário de pontos na grade."""
        out = []
        for a, b in zip(contorno, contorno[1:] + contorno[:1]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            d = "L" if dx > 0 else "O" if dx < 0 else "N" if dy > 0 else "S"
            out.append((a, b, d))
        return out

    @staticmethod
    def convexo(contorno, i):
        a, b, c = contorno[i - 1], contorno[i], contorno[(i + 1) % len(contorno)]
        return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0

    def ao_longo(self, a, d, L, mods, z, fn, ini=0.0):
        """Percorre de a na direção d por L metros com módulos (maiores primeiro) chamando fn(id_mod, x, y, comp)."""
        dx, dy = DV[d]
        s = ini
        while s < L - 1e-6:
            for comp, pid in mods:
                if L - s >= comp - 1e-6:
                    fn(pid, a[0] + dx * s, a[1] + dy * s, comp)
                    s += comp
                    break
            else:
                break

    def faixa_contorno(self, contorno, z, mods, canto=None, canto_conc=None, encurta=0.0, mats=None, pular=()):
        """Peças de borda ao longo do contorno (cinta, soco, beiral, rufo): módulos em cada lado, a peça de canto no canto
        convexo (giro = direção do lado que sai) e a de canto côncavo (giro = direção do lado que chega). encurta: o
        quanto a faixa recua nos cantos côncavos (0,5 no beiral). pular: índices de lados sem faixa (empenas)."""
        n = len(contorno)
        for i, (a, b, d) in enumerate(self.lados(contorno)):
            if i in pular:
                continue
            L = abs(b[0] - a[0]) + abs(b[1] - a[1])
            ini = encurta if not self.convexo(contorno, i) else 0.0
            fim = encurta if not self.convexo(contorno, (i + 1) % n) else 0.0
            self.ao_longo(a, d, L - fim, mods, z, lambda pid, x, y, c: self.poe(pid, x, y, z, DIR[d], mats), ini=ini)
        for i, p in enumerate(contorno):
            antes, depois = (i - 1) % n, i
            if antes in pular or depois in pular:
                continue
            lado_sai = self.lados(contorno)[depois][2]
            lado_chega = self.lados(contorno)[antes][2]
            if self.convexo(contorno, i):
                if canto:
                    self.poe(canto, p[0], p[1], z, DIR[lado_sai], mats)
            elif canto_conc:
                self.poe(canto_conc, p[0], p[1], z, DIR[lado_chega], mats)


# =====================================================================================================================
# Telhados: montadores (a receita de cada tipo)
# =====================================================================================================================
def mods_telhado(prefixo):
    return [(1.0, prefixo + "_1m"), (0.5, prefixo + "_0_5m")]


def telhado_duas_aguas(c, x0, y0, L, S, inc, zp, tex, eixo="x", pontas=("empena", "empena")):
    """Duas águas num retângulo: cumeeira ao longo do eixo ("x": o retângulo vai de (x0, y0) a (x0 + L, y0 + S)).
    pontas: o que fecha cada ponta, "empena" (oitão + empena) ou "quatro" (ponta de quatro águas)."""
    m = {"telha": c.mat_tex(tex, 0.62), "cumeeira": c.cor_cumeeira(tex)}
    suf = f"v{S}_{inc}"
    cz = c.itens[f"telhado_duas_aguas_{suf}_1m"]["cumeeira_z"]
    g = 0 if eixo == "x" else 90

    def P(u, v):  # coordenadas da ala (u ao longo da cumeeira, v através) → mundo
        return (x0 + u, y0 + v) if eixo == "x" else (x0 + S - v, y0 + u)
    u0 = S / 2 if pontas[0] == "quatro" else 0.0
    u1 = L - S / 2 if pontas[1] == "quatro" else L
    s = u0
    while s < u1 - 1e-6:
        comp = 1.0 if u1 - s >= 1 - 1e-6 else 0.5
        nome = "1m" if comp == 1.0 else "0_5m"
        x, y = P(s, 0)
        c.poe(f"telhado_duas_aguas_{suf}_{nome}", x, y, zp, g, m)
        x, y = P(s, S / 2)
        c.poe(f"telhado_cumeeira_{nome}", x, y, zp + cz, g, m)
        s += comp
    for k, ponta in enumerate(pontas):
        if ponta == "quatro":
            x, y = P(0, 0) if k == 0 else P(L, S)
            c.poe(f"telhado_quatro_aguas_ponta_{suf}", x, y, zp, g + 180 * k, m)
        elif ponta == "empena":
            x, y = P(0, 0) if k == 0 else P(L, S)
            c.poe(f"telhado_empena_{suf}", x, y, zp, g + 180 * k, m)


def oitao(c, inc, S, a, d, zp, dentro, fora, peca="telhado_oitao"):
    c.poe(f"{peca}_v{S}_{inc}" if "v" not in peca[-4:] else peca, a[0], a[1], zp, DIR[d],
          {"face_a": c.mat_tex(dentro), "face_b": c.mat_tex(fora)})


def beirais(c, contorno, zp, inc, tex, empenas=()):
    m = {"telha": c.mat_tex(tex, 0.62), "cumeeira": c.cor_cumeeira(tex)}
    c.faixa_contorno(contorno, zp, mods_telhado(f"telhado_beiral_{inc}"), canto=f"telhado_beiral_canto_externo_{inc}",
                     canto_conc=f"telhado_beiral_canto_interno_{inc}", encurta=BEIRAL, mats=m, pular=empenas)


def telhado_L(c, x0, y0, Lx, Ly, S, inc, zp, tex, oit=("degrade_gelo", "tijolo_terracota")):
    """L com as duas alas de vão S: ala 1 de (x0, y0) a (x0 + Lx, y0 + S), ala 2 de (x0, y0) a (x0 + S, y0 + Ly); o canto
    externo (espigão) em (x0, y0); empenas nas pontas (x0 + Lx e y0 + Ly)."""
    m = {"telha": c.mat_tex(tex, 0.62), "cumeeira": c.cor_cumeeira(tex)}
    suf = f"v{S}_{inc}"
    cz = c.itens[f"telhado_duas_aguas_{suf}_1m"]["cumeeira_z"]
    c.poe(f"telhado_canto_l_{suf}", x0, y0, zp, 0, m)
    telhado_duas_aguas(c, x0 + S, y0, Lx - S, S, inc, zp, tex, "x", pontas=(None, "empena"))
    telhado_duas_aguas(c, x0, y0 + S, Ly - S, S, inc, zp, tex, "y", pontas=(None, "empena"))
    cont = [(x0, y0), (x0 + Lx, y0), (x0 + Lx, y0 + S), (x0 + S, y0 + S), (x0 + S, y0 + Ly), (x0, y0 + Ly)]
    beirais(c, cont, zp, inc, tex, empenas=(1, 4))
    oitao(c, inc, S, (x0 + Lx, y0), "N", zp, *oit)
    oitao(c, inc, S, (x0 + S, y0 + Ly), "O", zp, *oit)
    return cont


def telhado_T(c, x0, y0, L, a, Ly, S, inc, zp, tex, oit=("degrade_gelo", "tijolo_terracota")):
    """T: ala principal de (x0, y0) a (x0 + L, y0 + S); a perna sai do lado de trás, de x0 + a a x0 + a + S, até y0 + Ly."""
    m = {"telha": c.mat_tex(tex, 0.62), "cumeeira": c.cor_cumeeira(tex)}
    suf = f"v{S}_{inc}"
    c.poe(f"telhado_encontro_t_{suf}", x0 + a, y0, zp, 0, m)
    telhado_duas_aguas(c, x0, y0, a, S, inc, zp, tex, "x", pontas=("empena", None))
    telhado_duas_aguas(c, x0 + a + S, y0, L - a - S, S, inc, zp, tex, "x", pontas=(None, "empena"))
    telhado_duas_aguas(c, x0 + a, y0 + S, Ly - S, S, inc, zp, tex, "y", pontas=(None, "empena"))
    cont = [(x0, y0), (x0 + L, y0), (x0 + L, y0 + S), (x0 + a + S, y0 + S), (x0 + a + S, y0 + Ly), (x0 + a, y0 + Ly),
            (x0 + a, y0 + S), (x0, y0 + S)]
    beirais(c, cont, zp, inc, tex, empenas=(1, 4, 7))
    oitao(c, inc, S, (x0 + L, y0), "N", zp, *oit)
    oitao(c, inc, S, (x0 + a + S, y0 + Ly), "O", zp, *oit)
    oitao(c, inc, S, (x0, y0 + S), "S", zp, *oit)
    return cont


def telhado_retangulo(c, x0, y0, L, S, inc, zp, tex, tipo="duas", oit=("degrade_gelo", "tijolo_terracota")):
    cont = [(x0, y0), (x0 + L, y0), (x0 + L, y0 + S), (x0, y0 + S)]
    if tipo == "duas":
        telhado_duas_aguas(c, x0, y0, L, S, inc, zp, tex)
        beirais(c, cont, zp, inc, tex, empenas=(1, 3))
        oitao(c, inc, S, (x0 + L, y0), "N", zp, *oit)
        oitao(c, inc, S, (x0, y0 + S), "S", zp, *oit)
    elif tipo == "quatro":
        telhado_duas_aguas(c, x0, y0, L, S, inc, zp, tex, pontas=("quatro", "quatro"))
        beirais(c, cont, zp, inc, tex)
    elif tipo == "mansarda":
        m = {"telha": c.mat_tex(tex, 0.62), "cumeeira": c.cor_cumeeira(tex)}
        cz = c.itens[f"telhado_mansarda_v{S}_1m"]["cumeeira_z"]
        s = 0.0
        while s < L - 1e-6:
            c.poe(f"telhado_mansarda_v{S}_1m", x0 + s, y0, zp, 0, m)
            c.poe("telhado_cumeeira_1m", x0 + s, y0 + S / 2, zp + cz, 0, m)
            s += 1.0
        c.poe(f"telhado_mansarda_empena_v{S}", x0, y0, zp, 0, m)
        c.poe(f"telhado_mansarda_empena_v{S}", x0 + L, y0 + S, zp, 180, m)
        beirais(c, cont, zp, "i25", tex, empenas=(1, 3))
        oitao(c, None, S, (x0 + L, y0), "N", zp, *oit, peca=f"telhado_mansarda_oitao_v{S}")
        oitao(c, None, S, (x0, y0 + S), "S", zp, *oit, peca=f"telhado_mansarda_oitao_v{S}")
    elif tipo == "meia":
        p = {"i25": 0.25, "i50": 0.5}[inc]
        m = {"telha": c.mat_tex(tex, 0.62)}
        suf = f"v{S}_{inc}"
        s = 0.0
        while s < L - 1e-6:
            c.poe(f"telhado_meia_agua_{suf}_1m", x0 + s, y0, zp, 0, m)
            c.poe(f"telhado_beiral_{inc}_1m", x0 + s, y0, zp, 0, m)
            c.poe(f"telhado_beiral_alto_{inc}_1m", x0 + s, y0 + S, zp + S * p, 0, m)
            s += 1.0
        c.poe(f"telhado_meia_agua_empena_esq_{suf}", x0, y0, zp, 0, m)
        c.poe(f"telhado_meia_agua_empena_dir_{suf}", x0 + L, y0, zp, 0, m)
        mo = {"face_a": c.mat_tex(oit[0]), "face_b": c.mat_tex(oit[1])}
        c.poe(f"telhado_meia_agua_oitao_desce_{suf}", x0, y0 + S, zp, 270, mo)
        c.poe(f"telhado_meia_agua_oitao_sobe_{suf}", x0 + L, y0, zp, 90, mo)
        h = S * p
        hid = {1.0: "mureta_1m"}.get(h)
        comp_id = f"parede_complemento_{('%g' % h).replace('.', '_')}m_1m" if h != 1.0 else "mureta_1m"
        s = 0.0
        while s < L - 1e-6:
            c.poe(comp_id, x0 + L - s, y0 + S, zp, 180, mo)
            s += 1.0
        for x in (x0, x0 + L):
            c.poe("pilar", x, y0 + S, zp, 0, esc_z=(h + 0.004) / 3.004)
    elif tipo == "platibanda":
        c.lajes(x0, y0, x0 + L, y0 + S, zp + LAJE, "mosaico_cinza")
        c.faixa_contorno(cont, zp + LAJE, [(4.0, "cinta_4m"), (2.0, "cinta_2m"), (1.0, "cinta_1m"), (0.5, "cinta_0_5m")],
                         canto="cinta_canto")
        tr = []
        for a, b, d in c.lados(cont):
            Ld = abs(b[0] - a[0]) + abs(b[1] - a[1])
            tr.append((a, d, ["mureta_2m"] * int(Ld // 2) + ["mureta_1m"] * int(round(Ld % 2)), oit[0], oit[1]))
        c.paredes(tr, z=zp + LAJE)
        c.faixa_contorno(cont, zp + LAJE + 1.0, [(2.0, "telhado_platibanda_rufo_2m"), (1.0, "telhado_platibanda_rufo_1m"),
                                                 (0.5, "telhado_platibanda_rufo_0_5m")], canto="telhado_platibanda_rufo_canto")
    return cont


def andar_cinta(c, contorno, z):
    c.faixa_contorno(contorno, z, [(4.0, "cinta_4m"), (2.0, "cinta_2m"), (1.0, "cinta_1m"), (0.5, "cinta_0_5m")],
                     canto="cinta_canto")


def fundacao(c, contorno, h):
    hs = f"h{int(round(h * 100))}"
    c.faixa_contorno(contorno, 0.0, [(4.0, f"soco_{hs}_4m"), (2.0, f"soco_{hs}_2m"), (1.0, f"soco_{hs}_1m"),
                                     (0.5, f"soco_{hs}_0_5m")], canto=f"soco_{hs}_canto")


def preenche(L, porta=None, janelas=()):
    """Lado de L metros: porta = metro onde começa a "porta_2m", janelas = onde começam as "janela_2m"; o resto em
    parede lisa de 2 m e 1 m."""
    alvos = sorted([(porta, ("porta_2m", "porta_classica_4_madeira"))] if porta is not None else []) + \
        sorted((j, ("janela_2m", "janela_quadrada_cruz_branca")) for j in janelas)
    alvos.sort(key=lambda t: t[0])
    pecas, s = [], 0.0
    for pos, pc in alvos + [(L, None)]:
        while pos - s >= 2 - 1e-6:
            pecas.append("parede_2m")
            s += 2
        while pos - s >= 1 - 1e-6:
            pecas.append("parede_1m")
            s += 1
        if pc:
            pecas.append(pc)
            s += 2
    return pecas


def trechos_contorno(c, contorno, aberturas, dentro, fora):
    """Trechos de parede de um contorno anti-horário; aberturas[i] = (porta, janelas) do lado i."""
    out = []
    for i, (a, b, d) in enumerate(c.lados(contorno)):
        L = abs(b[0] - a[0]) + abs(b[1] - a[1])
        porta, jan = aberturas.get(i, (None, ()))
        out.append((a, d, preenche(L, porta, jan), dentro, fora))
    return out


# =====================================================================================================================
# Casas de teste
# =====================================================================================================================
def casa(c, contorno, retangulos, h, andares, aberturas, dentro, fora, piso, telhado, escada=None, sacada=None,
         contorno_terreo=None, retangulos_terreo=None):
    """Casa de 1 ou 2 andares. contorno: anti-horário (o mesmo nos dois andares, ou contorno_terreo para o térreo);
    retangulos: os retângulos que cobrem a planta (chão e laje); aberturas[n][i] = (porta, janelas) do lado i no andar n;
    telhado(c, zp): o montador do telhado; escada = (id, x, y, giro, laje com abertura (id, x, y, giro))."""
    ct = contorno_terreo or contorno
    rt = retangulos_terreo or retangulos
    if h > 0:
        fundacao(c, ct, h)
    for x0, y0, x1, y1 in rt:
        c.chao(x0, y0, x1, y1, h, piso)
    for n in range(andares):
        z = h + ANDAR * n
        cont = ct if n == 0 else contorno
        if n > 0:
            for x0, y0, x1, y1 in retangulos:
                ab = escada[4] if escada and x0 <= escada[4][1] < x1 and y0 <= escada[4][2] < y1 else None
                c.lajes(x0, y0, x1, y1, z, piso, abertura=ab)
            andar_cinta(c, contorno, z)
        c.paredes(trechos_contorno(c, cont, aberturas.get(n, {}), dentro, fora), z=z)
    if escada:
        c.poe(escada[0], escada[1], escada[2], h, escada[3])
    zp = h + ANDAR * (andares - 1) + ALT
    return telhado(c, zp)


def cena_encaixe(c, quais="todas"):
    """As seis casas do teste de encaixe (retangular, L e T, de 1 e 2 andares) e uma fileira com os outros telhados."""
    fora, dentro = "tijolo_branco", "degrade_gelo"
    casas = {}
    # 1. retangular 8 × 6, 1 andar, duas águas 50 %, cerâmica, fundação 0,45 com degraus
    ox, oy = 0, 0
    cont = [(ox, oy), (ox + 8, oy), (ox + 8, oy + 6), (ox, oy + 6)]
    casa(c, cont, [(ox, oy, ox + 8, oy + 6)], 0.45, 1, {0: {0: (2, (0, 6)), 1: (None, (2,)), 3: (None, (2,))}},
         dentro, "degrade_azul", "madeira_mel",
         lambda c, zp: telhado_retangulo(c, ox, oy, 8, 6, "i50", zp, "telha_ceramica", "duas",
                                         oit=(dentro, "degrade_azul")))
    c.poe("degraus_entrada_h45", ox + 3, oy, 0, 0)
    luz_porta(c, ox + 4.5, oy, 0.45, [(ox + 4, oy + 3, 2.2)])
    casas["R1"] = (ox, oy, 8, 6)
    # 2. L de vão 6, 1 andar, ardósia 50 %
    ox, oy = 16, 0
    cont = [(ox, oy), (ox + 10, oy), (ox + 10, oy + 6), (ox + 6, oy + 6), (ox + 6, oy + 10), (ox, oy + 10)]
    casa(c, cont, [(ox, oy, ox + 10, oy + 6), (ox, oy + 6, ox + 6, oy + 10)], 0.30, 1,
         {0: {0: (4, (0, 8)), 5: (None, (2, 6))}}, dentro, "tijolo_terracota", "madeira_nogueira",
         lambda c, zp: telhado_L(c, ox, oy, 10, 10, 6, "i50", zp, "telha_ardosia", oit=(dentro, "tijolo_terracota")))
    c.poe("degraus_entrada_h30", ox + 5, oy, 0, 0)
    luz_porta(c, ox + 6.5, oy, 0.30, [(ox + 5, oy + 3, 2.2), (ox + 3, oy + 7.5, 2.2)])
    casas["L1"] = (ox, oy, 10, 10)
    # 3. T de vão 6, 1 andar, cerâmica vermelha 75 %
    ox, oy = 32, 0
    cont = [(ox, oy), (ox + 12, oy), (ox + 12, oy + 6), (ox + 9, oy + 6), (ox + 9, oy + 10), (ox + 3, oy + 10),
            (ox + 3, oy + 6), (ox, oy + 6)]
    casa(c, cont, [(ox, oy, ox + 12, oy + 6), (ox + 3, oy + 6, ox + 9, oy + 10)], 0.30, 1,
         {0: {0: (4, (0, 8, 10)), 4: (None, (2,))}}, dentro, "degrade_mostarda", "madeira_pinus",
         lambda c, zp: telhado_T(c, ox, oy, 12, 3, 10, 6, "i75", zp, "telha_ceramica_vermelha",
                                 oit=(dentro, "degrade_mostarda")))
    c.poe("degraus_entrada_h30", ox + 5, oy, 0, 0)
    luz_porta(c, ox + 6.5, oy, 0.30, [(ox + 4, oy + 3, 2.2), (ox + 9, oy + 3, 2.2), (ox + 6, oy + 8, 2.2)])
    casas["T1"] = (ox, oy, 12, 10)
    # 4. retangular 8 × 8, 2 andares, quatro águas 25 %, metálica azul, escada reta, sacada
    ox, oy = 0, 18
    cont = [(ox, oy), (ox + 8, oy), (ox + 8, oy + 8), (ox, oy + 8)]
    casa(c, cont, [(ox, oy, ox + 8, oy + 8)], 0.45, 2, {0: {0: (3, (0, 6)), 1: (None, (2, 4))}, 1: {0: (3, (0, 6)), 2: (None, (2, 4))}},
         dentro, "listra_celeste", "madeira_clara",
         lambda c, zp: telhado_retangulo(c, ox, oy, 8, 8, "i25", zp, "telha_metalica_azul", "quatro"),
         escada=("escada_reta", ox, oy + 3, 0, ("laje_abertura_reta", ox, oy + 4, 0)))
    c.poe("degraus_entrada_h45", ox + 4, oy, 0, 0)
    luz_porta(c, ox + 5.5, oy, 0.45, [(ox + 4, oy + 4, 2.2), (ox + 4, oy + 4, 5.4)])
    c.poe("sacada_2x1m_metal", ox + 3, oy, 0.45 + ANDAR, 0, {"piso": c.mat_tex("mosaico_cinza")})
    casas["R2"] = (ox, oy, 8, 8)
    # 5. L de vão 8, 2 andares, duas águas 50 %, cerâmica, escada em L
    ox, oy = 16, 18
    cont = [(ox, oy), (ox + 12, oy), (ox + 12, oy + 8), (ox + 8, oy + 8), (ox + 8, oy + 12), (ox, oy + 12)]
    casa(c, cont, [(ox, oy, ox + 12, oy + 8), (ox, oy + 8, ox + 8, oy + 12)], 0.60, 2,
         {0: {0: (5, (1, 9)), 5: (None, (4,))}, 1: {0: (None, (1, 5, 9)), 5: (None, (4,))}}, dentro, "tijolo_marrom",
         "madeira_mel", lambda c, zp: telhado_L(c, ox, oy, 12, 12, 8, "i50", zp, "telha_ceramica",
                                                oit=(dentro, "tijolo_marrom")),
         escada=("escada_l_dir", ox + 4, oy + 4, 0, ("laje_abertura_l_dir", ox + 4, oy + 4, 0)))
    c.poe("degraus_entrada_h60", ox + 6, oy, 0, 0)
    luz_porta(c, ox + 7.5, oy, 0.60, [(ox + 4, oy + 4, 2.2), (ox + 9, oy + 4, 5.4), (ox + 4, oy + 9, 5.4)])
    casas["L2"] = (ox, oy, 12, 12)
    # 6. T de vão 6, 2 andares, duas águas 25 %, metálica vermelha, escada em U
    ox, oy = 32, 18
    cont = [(ox, oy), (ox + 12, oy), (ox + 12, oy + 6), (ox + 9, oy + 6), (ox + 9, oy + 10), (ox + 3, oy + 10),
            (ox + 3, oy + 6), (ox, oy + 6)]
    casa(c, cont, [(ox, oy, ox + 12, oy + 6), (ox + 3, oy + 6, ox + 9, oy + 10)], 0.30, 2,
         {0: {0: (4, (0, 8, 10))}, 1: {0: (None, (0, 4, 8, 10))}}, dentro, "listra_verde", "madeira_acinzentada",
         lambda c, zp: telhado_T(c, ox, oy, 12, 3, 10, 6, "i25", zp, "telha_metalica_vermelha",
                                 oit=(dentro, "listra_verde")),
         escada=("escada_u_dir", ox + 8, oy + 1, 0, ("laje_abertura_u", ox + 8, oy, 0)))
    c.poe("degraus_entrada_h30", ox + 5, oy, 0, 0)
    luz_porta(c, ox + 6.5, oy, 0.30, [(ox + 4, oy + 3, 2.2), (ox + 9, oy + 3, 5.4), (ox + 6, oy + 8, 5.4)])
    casas["T2"] = (ox, oy, 12, 10)
    # fileira de baixo: mansarda, meia-água, platibanda e quatro águas em L
    oy = -16
    for k, (tipo, W, D, inc, tex, fora_) in enumerate((("mansarda", 8, 6, None, "telha_ardosia_escamas", "papel_nuvens"),
                                                        ("meia", 6, 4, "i25", "telha_metalica_cinza", "listra_laranja"),
                                                        ("platibanda", 8, 6, None, None, "degrade_verde"),
                                                        ("meia", 6, 4, "i50", "telha_ceramica", "tijolo_rustico"))):
        ox = k * 13
        cont = [(ox, oy), (ox + W, oy), (ox + W, oy + D), (ox, oy + D)]
        casa(c, cont, [(ox, oy, ox + W, oy + D)], 0.30, 1, {0: {0: (2, (0,) if W > 6 else ()), 1: (None, (2,))}},
             dentro, fora_, "madeira_clara",
             lambda c, zp, ox=ox, W=W, D=D, inc=inc, tex=tex, tipo=tipo, fora_=fora_:
             telhado_retangulo(c, ox, oy, W, D, inc, zp, tex, tipo, oit=(dentro, fora_)))
        c.poe("degraus_entrada_h30", ox + 3, oy, 0, 0)
        luz_porta(c, ox + 4.5, oy, 0.30, [(ox + W / 2, oy + D / 2, 2.2)])
    return casas


def luz_porta(c, x, y, h, dentro=()):
    """Arandela ao lado da porta (na face de fora da parede da frente) e luzes quentes dentro da casa (para a noite)."""
    c.poe("arandela_varanda", x, y - MEIA, h + 1.9, 0)
    c.luzes_extra = getattr(c, "luzes_extra", []) + [(x, y - 0.35, h + 2.1)] + [(a, b, h + z) for a, b, z in dentro]


def cena_lote(c):
    """O exemplo do lote de 30 × 15 m: casa de dois andares com varanda embaixo do andar de cima, telhado de duas águas,
    cerca com portões, piscina com prainha, escadinha e trampolim, garagem aberta, caminho de pedras e luzes."""
    luzes = []
    c.poe("lote_30x15", 0, 0, 0, 0)
    h = 0.45
    x0, y0, W, D = -12.0, -3.5, 10, 8
    fora, dentro = "tijolo_branco", "degrade_gelo"
    cont = [(x0, y0), (x0 + W, y0), (x0 + W, y0 + D), (x0, y0 + D)]
    ct = [(x0, y0 + 2), (x0 + W, y0 + 2), (x0 + W, y0 + D), (x0, y0 + D)]
    casa(c, cont, [(x0, y0, x0 + 8, y0 + D), (x0 + 8, y0, x0 + W, y0 + D)], h, 2,
         {0: {0: (4, (0, 7)), 1: (None, (2,)), 3: (None, (2,))}, 1: {0: (None, (0, 4, 8)), 1: (None, (2,)), 2: (None, (2, 6)),
                                                                    3: (None, (2, 4))}},
         dentro, fora, "madeira_mel",
         lambda c, zp: telhado_retangulo(c, x0, y0, W, D, "i50", zp, "telha_ceramica", "duas", oit=(dentro, fora)),
         escada=("escada_reta", x0, y0 + 3, 0, ("laje_abertura_reta", x0, y0 + 4, 0)),
         contorno_terreo=ct, retangulos_terreo=[(x0, y0 + 2, x0 + 8, y0 + D), (x0 + 8, y0 + 2, x0 + W, y0 + D)])
    # varanda: deck, colunas, vigas embaixo do andar de cima, guarda-corpo, degraus
    for x in range(0, 10, 2):
        c.poe("deck_2x2m_h45", x0 + x, y0 + 2, h, 0)
    for x in (0.15, 3, 7, 9.85):  # nas pontas, 15 cm para dentro: a base fica inteira em cima do deck
        c.poe("coluna_classica", x0 + x, y0 + 0.15, h, 0)
    for k in range(5):
        c.poe("viga_2m", x0 + 2 * k, y0, h, 0)
    c.poe("viga_2m", x0, y0 + 2, h, 270)
    c.poe("viga_2m", x0 + W, y0, h, 90)
    for xa, xb in ((0.35, 2.85), (7.15, 9.65)):
        s = xa
        while s < xb - 1e-6:
            comp = 1.0 if xb - s >= 1.0 - 1e-6 else 0.5
            c.poe(f"guarda_corpo_madeira_{'1m' if comp == 1 else '0_5m'}", x0 + s, y0, h - 0.02, 0)
            s += comp
        c.poe("guarda_corpo_madeira_fim", x0 + xb, y0, h - 0.02, 0)
    c.poe("degraus_entrada_h45", x0 + 5, y0 + 0.105, -0.02, 0)
    luzes += [(x0 + 3, y0 + 5, h + 2.2), (x0 + 7, y0 + 5, h + 2.2), (x0 + 3, y0 + 3, h + 5.4), (x0 + 7, y0 + 5, h + 5.4)]  # no deck, 2 cm abaixo (o deck fica 2 cm abaixo do piso)
    for x in (2.0, 7.0):
        c.poe("plafon_varanda", x0 + x, y0 + 1.0, h + ANDAR - LAJE, 0)
        luzes.append((x0 + x, y0 + 1.0, h + ANDAR - LAJE - 0.25))
    for x in (2.6, 6.5):
        c.poe("arandela_varanda", x0 + x, y0 + 2 - MEIA, h + 1.9, 0)
        luzes.append((x0 + x, y0 + 2 - 0.3, h + 2.1))
    # cerca: frente de gradil com portão de pedestre e portão de correr; laterais e fundo ripados
    xs = 14.5
    yf, yb = -5.5, 6.5

    def lance(a, d, pecas):
        dx, dy = DV[d]
        x, y = a
        for pid, comp in pecas:
            c.poe(pid, x, y, 0, DIR[d])
            x += dx * comp
            y += dy * comp
    m = lambda t, n, comp=2: [(f"cerca_{t}_{comp}m", float(comp))] * n  # noqa: E731
    lance((-xs, yf), "L", m("metal", 1, 1) + m("metal", 3) + [("portao_pedestre_metal", 1.0)] + m("metal", 8) +
          m("metal", 1, 1) + [("portao_garagem_correr", 3.0)] + m("metal", 1, 1))
    lance((xs, yf), "N", m("ripada", 6))
    lance((xs, yb), "O", m("ripada", 14) + m("ripada", 1, 1))
    lance((-xs, yb), "S", m("ripada", 6))
    for x, y in ((-xs, yf), (xs, yf), (xs, yb), (-xs, yb)):
        c.poe("cerca_ripada_canto", x, y, 0, 0)
    # piscina 7 × 3 (células de 1 m) com prainha, escadinha, trampolim e luz
    px0, py0, NX, NY = 1.0, 0.5, 7, 3
    for i in range(NX):
        for j in range(NY):
            x, y = px0 + i, py0 + j
            borda_s, borda_n, borda_o, borda_l = j == 0, j == NY - 1, i == 0, i == NX - 1
            if borda_s and borda_o:
                c.poe("piscina_canto", x, y, 0, 0)
            elif borda_s and borda_l:
                c.poe("piscina_canto", x + 1, y, 0, 90)
            elif borda_n and borda_l:
                c.poe("piscina_canto", x + 1, y + 1, 0, 180)
            elif borda_n and borda_o:
                c.poe("piscina_canto", x, y + 1, 0, 270)
            elif borda_s:
                c.poe("piscina_borda_luz" if i == 3 else "piscina_borda", x, y, 0, 0)
            elif borda_n:
                c.poe("piscina_borda", x + 1, y + 1, 0, 180)
            elif borda_o:
                c.poe("piscina_borda", x, y + 1, 0, 270)
            elif borda_l:
                c.poe("piscina_borda", x + 1, y, 0, 90)
            else:
                c.poe("piscina_miolo", x, y, 0, 0)
            if i == 0:
                c.poe("piscina_prainha", x, y, 0, 0)
            elif i == 1:
                c.poe("piscina_prainha_rampa", x, y + 1, 0, 270)
    luzes.append((px0 + 3.5, py0 + 0.3, -0.6))
    c.poe("piscina_escadinha", px0 + 5.5, py0 + NY, 0, 180)
    c.poe("piscina_trampolim", px0 + NX, py0 + 1.5, 0, 90)
    c.recorte = (px0, py0, px0 + NX, py0 + NY)
    # garagem aberta sobre a entrada (x 10,5..13,5) e caminho de pedras do portão até os degraus da varanda
    c.poe("telheiro_3x6m", 10.5, -4.0, 0, 0)
    luzes += [(12.0, -2.2, 2.2), (12.0, 0.2, 2.2)]
    c.poe("caminho_pedras_1m", -7.0, -5.45, 0, 0)
    for x, y in ((-8.0, -4.9), (-6.0, -4.9), (9.5, -4.6)):
        c.poe("balizador_jardim", x, y, 0, 0)
        luzes.append((x, y, 0.5))
    return luzes


# =====================================================================================================================
# Render e medidas
# =====================================================================================================================
def recorta_gramado(c):
    """Recorta a piscina no gramado do lote (o objeto "recortavel"): corta a malha nas quatro linhas da piscina e tira
    as faces de dentro, como o motor faria."""
    if not getattr(c, "recorte", None):
        return
    import bmesh
    x0, y0, x1, y1 = c.recorte
    for o in c.objs:
        if not (o.type == "MESH" and o.get("recortavel")):
            continue
        o.data = o.data.copy()
        Mi = o.matrix_world.inverted()
        bm = bmesh.new()
        bm.from_mesh(o.data)
        for co, no in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0)), ((0, y0, 0), (0, 1, 0)), ((0, y1, 0), (0, 1, 0))):
            pl = Mi @ V(co)
            nl = (Mi.to_3x3() @ V(no)).normalized()
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=pl, plane_no=nl)
        M = o.matrix_world
        fora = [f for f in bm.faces if (lambda q: x0 + 1e-4 < q.x < x1 - 1e-4 and y0 + 1e-4 < q.y < y1 - 1e-4)(
            M @ f.calc_center_median())]
        bmesh.ops.delete(bm, geom=fora, context="FACES")
        bm.to_mesh(o.data)
        bm.free()


def luz_e_camera(alvo, dist, azim=-35, elev=0.75, lente=40, res=(1600, 1000), noite=False, luzes=()):
    scn = bpy.context.scene
    for o in [o for o in scn.objects if o.type in ("LIGHT", "CAMERA")]:
        bpy.data.objects.remove(o, do_unlink=True)
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", 40))
    scn.cycles.use_denoising = True
    scn.cycles.device = "CPU"
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("ceu")
    scn.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*_lin("#16233F" if noite else "#A9C6EE"), 1)
    bg.inputs[1].default_value = 0.35 if noite else 0.9
    bpy.ops.object.light_add(type="SUN")
    sol = bpy.context.active_object
    sol.data.energy = 0.35 if noite else 3.6
    sol.data.color = (0.6, 0.7, 1.0) if noite else (1.0, 0.97, 0.92)
    sol.data.angle = math.radians(6)
    sol.rotation_euler = (math.radians(48), 0, math.radians(azim + 150))
    for m in bpy.data.materials:
        if m.name.split(".")[0] in ("luz",) and m.use_nodes:
            m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 9.0 if noite else 1.2
    if noite:
        for (x, y, z) in luzes:
            bpy.ops.object.light_add(type="POINT", location=(x, y, z))
            l = bpy.context.active_object
            l.data.energy = 60
            l.data.color = (1.0, 0.82, 0.55)
            l.data.shadow_soft_size = 0.15
    cd = bpy.data.cameras.new("c")
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cd.lens = lente
    cd.clip_end = 600
    d = V((math.sin(math.radians(azim)), -math.cos(math.radians(azim)), elev)).normalized()
    cam.location = V(alvo) + d * dist
    cam.rotation_euler = (V(alvo) - cam.location).to_track_quat("-Z", "Y").to_euler()


def chao_fundo(c, cx, cy, tam=400):
    bpy.ops.mesh.primitive_plane_add(size=tam, location=(cx, cy, -0.012))
    pl = bpy.context.active_object
    m = bpy.data.materials.new("fundo")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*_lin("#7FBF5A"), 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
    pl.data.materials.append(m)
    return pl


def render(arq):
    bpy.context.scene.render.filepath = arq
    bpy.ops.render.render(write_still=True)
    print("render", arq, flush=True)


def _mat_hit(obj, idx):
    if obj is None or obj.type != "MESH":
        return ""
    try:
        p = obj.data.polygons[idx]
    except (IndexError, AttributeError):
        return ""
    s = obj.material_slots[p.material_index] if p.material_index < len(obj.material_slots) else None
    if s is None or s.material is None:
        return ""
    n = s.material.name
    return n


def mede_telhado(c, rects, passo=0.02, p_max=0.75, linhas=()):
    """Raios de cima para baixo na área do telhado (retângulos já com o beiral, 4 cm para dentro da testeira): cada raio
    tem de bater na telha (ou na cumeeira, testeira, rufo). Conta as frestas (o raio passa para a parede, o chão ou o
    vazio) e o maior degrau entre amostras vizinhas de telha (além da inclinação). linhas: (eixo, valor, a0, a1) para
    medir a emenda dos dois lados de uma linha (±1 mm)."""
    dg = bpy.context.evaluated_depsgraph_get()
    scn = bpy.context.scene
    frestas, n, degrau_max, onde = [], 0, 0.0, None
    for (x0, y0, x1, y1) in rects:
        nx, ny = int((x1 - x0) / passo) + 1, int((y1 - y0) / passo) + 1
        grade = {}
        for i in range(nx):
            for j in range(ny):
                x, y = x0 + i * passo, y0 + j * passo
                hit, loc, nor, idx, obj, _ = scn.ray_cast(dg, V((x, y, 60)), V((0, 0, -1)))
                n += 1
                nome = _mat_hit(obj, idx) if hit else ""
                base = nome.split(".")[0]
                if base.startswith("m_telha") or base.startswith("m_waffle"):
                    grade[(i, j)] = loc.z
                elif base.startswith("m_#") or base in ("borda", "atlas", "cumeeira"):
                    pass  # cumeeira (cor), testeira, rufo
                else:
                    frestas.append((round(x, 3), round(y, 3), base))
        for (i, j), z in grade.items():
            for di, dj in ((1, 0), (0, 1)):
                z2 = grade.get((i + di, j + dj))
                if z2 is not None:
                    dz = abs(z2 - z) - p_max * passo * 1.02
                    if dz > degrau_max:
                        degrau_max, onde = dz, (round(x0 + i * passo, 3), round(y0 + j * passo, 3))
    emendas = []
    for eixo, val, a0, a1 in linhas:
        pior = 0.0
        a = a0
        while a <= a1 + 1e-9:
            zs = []
            for s_ in (-0.001, 0.001):
                p = V((val + s_, a, 60)) if eixo == "x" else V((a, val + s_, 60))
                hit, loc, nor, idx, obj, _ = scn.ray_cast(dg, p, V((0, 0, -1)))
                if hit and _mat_hit(obj, idx).startswith("m_telha"):
                    zs.append(loc.z)
            if len(zs) == 2:
                pior = max(pior, abs(zs[0] - zs[1]) - 0.002 * p_max)
            a += 0.01
        emendas.append((eixo, val, round(max(pior, 0.0) * 1000, 2)))
    return {"amostras": n, "frestas": len(frestas), "exemplos_fresta": frestas[:8],
            "degrau_max_mm": round(max(degrau_max, 0) * 1000, 2), "onde": onde, "emendas_mm": emendas}


def mede_fachada(c, x0, y0, x1, y1, z0, z1, ruins_nomes, passo=0.03, pula=()):
    """Raios horizontais de fora para dentro nas quatro faces da caixa da casa (de z0 a z1). Uma fresta é um raio que
    bate numa face de dentro (textura de dentro), no piso, no lado de dentro de uma laje ou no vazio: o raio passou por
    uma emenda. Vidro, portas, batentes, soco, cinta e cantoneira contam como fachada."""
    dg = bpy.context.evaluated_depsgraph_get()
    scn = bpy.context.scene
    ruins, n = [], 0
    lados = [((x0, y0 - 3), (1, 0), (0, 1), x1 - x0), ((x1 + 3, y0), (0, 1), (-1, 0), y1 - y0),
             ((x1, y1 + 3), (-1, 0), (0, -1), x1 - x0), ((x0 - 3, y1), (0, -1), (1, 0), y1 - y0)]
    for (ox, oy), (ux, uy), (dx, dy), L in lados:
        s = 0.043
        while s < L - 0.04:
            z = z0
            while z < z1:
                o = V((ox + ux * s, oy + uy * s, z))
                hit, loc, nor, idx, obj, _ = scn.ray_cast(dg, o, V((dx, dy, 0)))
                n += 1
                nome = _mat_hit(obj, idx).split(".")[0] if hit else "vazio"
                if (nome in ruins_nomes or nome == "vazio") and not any(a_ <= z <= b_ for a_, b_ in pula):
                    ruins.append((round(o.x, 2), round(o.y, 2), round(z, 2), nome))
                z += passo
            s += passo * 2
    return {"amostras": n, "frestas": len(ruins), "exemplos": ruins[:10]}


P_AGUA_ = -0.10


def mede_piscina(c, x0, y0, x1, y1, passo=0.02):
    """Raios de cima na piscina: dentro das células o primeiro toque tem de ser a água (ou a escadinha/trampolim, que são
    da paleta); na borda de pedra (0,35 m em volta), a pedra. Grama dentro da piscina ou vazio = fresta."""
    dg = bpy.context.evaluated_depsgraph_get()
    scn = bpy.context.scene
    ruins, n = [], 0
    x = x0 - 0.3 + 0.0037  # fora das linhas exatas das emendas (um raio bem na aresta comum de dois objetos escapa)
    while x <= x1 + 0.3:
        y = y0 - 0.3 + 0.0041
        while y <= y1 + 0.3:
            hit, loc, nor, idx, obj, _ = scn.ray_cast(dg, V((x, y, 30)), V((0, 0, -1)))
            n += 1
            nome = _mat_hit(obj, idx).split(".")[0] if hit else "vazio"
            dentro = x0 + 0.001 < x < x1 - 0.001 and y0 + 0.001 < y < y1 - 0.001
            if dentro and nome not in ("agua", "atlas"):
                ruins.append((round(x, 3), round(y, 3), nome))
            if dentro and nome == "atlas" and loc.z < -0.2:
                ruins.append((round(x, 3), round(y, 3), "abaixo da agua"))
            if not dentro and nome == "vazio":
                ruins.append((round(x, 3), round(y, 3), nome))
            y += passo
        x += passo
    # emendas entre células: ±1 mm de cada lado de cada linha, a cada 1 cm
    em = 0
    for xs_ in [x0 + k for k in range(1, int(round(x1 - x0)))]:
        for s_ in (-0.001, 0.001):
            y = y0 + 0.065  # fora do bocel da borda, que avança 5 cm sobre a água
            while y < y1 - 0.06:
                hit, loc, nor, idx, obj, _ = scn.ray_cast(dg, V((xs_ + s_, y, 30)), V((0, 0, -1)))
                em += 1
                mh = _mat_hit(obj, idx).split(".")[0] if hit else ""
                if not hit or (mh != "atlas" and (mh != "agua" or abs(loc.z - P_AGUA_) > 0.002)):
                    ruins.append((round(xs_ + s_, 3), round(y, 3), "emenda"))
                y += 0.01
    for ys_ in [y0 + k for k in range(1, int(round(y1 - y0)))]:
        for s_ in (-0.001, 0.001):
            x = x0 + 0.065
            while x < x1 - 0.06:
                hit, loc, nor, idx, obj, _ = scn.ray_cast(dg, V((x, ys_ + s_, 30)), V((0, 0, -1)))
                em += 1
                mh = _mat_hit(obj, idx).split(".")[0] if hit else ""
                if not hit or (mh != "atlas" and (mh != "agua" or abs(loc.z - P_AGUA_) > 0.002)):
                    ruins.append((round(x, 3), round(ys_ + s_, 3), "emenda"))
                x += 0.01
    return {"amostras": n, "amostras_emendas": em, "frestas": len(ruins), "exemplos": ruins[:8]}


def specs_encaixe():
    """Área de telhado (com o beiral, 4 cm para dentro da testeira) e caixa da fachada de cada casa do teste."""
    e = BEIRAL - 0.04
    R = lambda x0, y0, x1, y1: (x0 - e, y0 - e, x1 + e, y1 + e)  # noqa: E731
    return {
        "R1": dict(rects=[R(0, 0, 8, 6)], fach=(0, 0, 8, 6, 0.04, 0.45 + 2.9), p=0.5),
        "L1": dict(rects=[R(16, 0, 26, 6), R(16, 0, 22, 10)], fach=(16, 0, 26, 10, 0.04, 0.3 + 2.9), p=0.5),
        "T1": dict(rects=[R(32, 0, 44, 6), R(35, 0, 41, 10)], fach=(32, 0, 44, 10, 0.04, 0.3 + 2.9), p=0.75),
        "R2": dict(rects=[R(0, 18, 8, 26)], fach=(0, 18, 8, 26, 0.04, 0.45 + 6.1), p=0.25),
        "L2": dict(rects=[R(16, 18, 28, 26), R(16, 18, 24, 30)], fach=(16, 18, 28, 30, 0.04, 0.6 + 6.1), p=0.5),
        "T2": dict(rects=[R(32, 18, 44, 24), R(35, 18, 41, 28)], fach=(32, 18, 44, 28, 0.04, 0.3 + 6.1), p=0.25),
        "mansarda": dict(rects=[R(0, -16, 8, -10)], fach=(0, -16, 8, -10, 0.04, 3.2), p=3.0),
        "meia_i25": dict(rects=[R(13, -16, 19, -12)], fach=(13, -16, 19, -12, 0.04, 3.2), p=0.25),
        "meia_i50": dict(rects=[R(39, -16, 45, -12)], fach=(39, -16, 45, -12, 0.04, 3.2), p=0.5),
        "platibanda": dict(rects=[], fach=(26, -16, 34, -10, 0.04, 4.4), p=0.0),
    }


VITRINES = {
    "telhados": lambda i: ("v6_i50" in i["id"] and "meia" not in i["id"]) or i["id"] in (
        "telhado_canto_l_v6_i25", "telhado_canto_l_v6_i75", "telhado_beiral_i50_1m", "telhado_beiral_i50_0_5m",
        "telhado_beiral_canto_externo_i50", "telhado_beiral_canto_interno_i50", "telhado_cumeeira_1m",
        "telhado_cumeeira_0_5m", "telhado_meia_agua_v4_i25_1m", "telhado_meia_agua_empena_esq_v4_i25",
        "telhado_meia_agua_oitao_sobe_v4_i25", "telhado_beiral_alto_i25_1m", "telhado_rufo_i25_1m", "telhado_mansarda_v6_1m",
        "telhado_mansarda_empena_v6", "telhado_mansarda_oitao_v6", "telhado_platibanda_rufo_2m",
        "telhado_platibanda_rufo_canto", "parede_complemento_1_5m_2m"),
    "andares": lambda i: True,
    "acesso": lambda i: "_h30" not in i["id"] and "_h60" not in i["id"],
    "cercas": lambda i: True,
    "quintal": lambda i: True,
}
TEX_VITRINE = {"telha": "telha_ceramica", "face_a": "degrade_azul", "face_b": "degrade_azul", "piso": "madeira_pinus",
               "pastilha": "piscina"}


def vitrine(c, secao, noite, saida):
    """As peças de uma seção em fileiras, no fundo azul das vitrines, com as texturas padrão de cada uma."""
    itens = [i for i in c.cat[secao] if VITRINES[secao](i)]
    if secao == "quintal":
        itens += [i for i in c.cat["lotes"] if i["id"] == "caixa_correio"]
    filas, fila, larg = [], [], 0.0
    lim = {"telhados": 26, "andares": 20, "acesso": 15, "cercas": 13, "quintal": 13}[secao]
    for it in itens:
        l = it["dims"][0]
        if fila and larg + l > lim:
            filas.append(fila)
            fila, larg = [], 0.0
        fila.append(it)
        larg += l + 0.5
    if fila:
        filas.append(fila)
    y = 0.0
    for fila in filas:
        prof = max(i["dims"][1] for i in fila)
        x = 0.0
        for it in fila:
            texs = dict(TEX_VITRINE, **it.get("texturas_padrao", {}))
            mats = {k: c.mat_tex(v, 0.62) for k, v in texs.items()}
            mats["cumeeira"] = c.cor_cumeeira(texs["telha"])
            n0 = len(c.objs)
            raiz = c.poe(it["id"], 0, 0, 0, 0, mats)
            bpy.context.view_layer.update()
            novos = [o for o in c.objs[n0:] if o.type == "MESH" and not o.hide_render]
            pts = [o.matrix_world @ V(cn) for o in novos for cn in o.bound_box]
            lo = V([min(p_[k] for p_ in pts) for k in range(3)])
            hi = V([max(p_[k] for p_ in pts) for k in range(3)])
            raiz.matrix_world = Matrix.Translation((x - lo.x, y - hi.y, -lo.z)) @ raiz.matrix_world
            x += it["dims"][0] + 0.5
        y -= prof + 0.9 + 0.55 * max(i["dims"][2] for i in fila)
    bpy.context.view_layer.update()
    vis = [o for o in c.objs if o.type == "MESH" and not o.hide_render]
    pts = [o.matrix_world @ V(cn) for o in vis for cn in o.bound_box]
    lo = V([min(p_[k] for p_ in pts) for k in range(3)])
    hi = V([max(p_[k] for p_ in pts) for k in range(3)])
    cc = (lo + hi) / 2
    scn = bpy.context.scene
    luz_e_camera(cc, 80, azim=-24, elev=0.95, lente=50, res=(1800, 1100), noite=noite,
                 luzes=[(o.matrix_world.translation.x, o.matrix_world.translation.y, o.matrix_world.translation.z + 0.4)
                        for o in vis if any(s_.material and s_.material.name.split(".")[0] == "luz" for s_ in o.material_slots
                                            if s_.material) and o.parent is None][:24])
    w = scn.world
    w.node_tree.nodes["Background"].inputs[0].default_value = (*_lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    if noite:  # vitrine de noite: luar mais claro que o das casas, para as peças aparecerem
        w.node_tree.nodes["Background"].inputs[1].default_value = 1.1
        for o in scn.objects:
            if o.type == "LIGHT" and o.data.type == "SUN":
                o.data.energy = 0.9
    cam = scn.camera
    cam.data.type = "ORTHO"
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p_ - cc) for p_ in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cam.data.ortho_scale = max(ex, ey * 1800 / 1100) * 1.06
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    bpy.ops.mesh.primitive_plane_add(size=600, location=(cc.x, cc.y, -0.002 + min(lo.z, 0)))
    pl = bpy.context.active_object
    m = bpy.data.materials.new("chao_vitrine")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*_lin("#141E36" if noite else "#2A3D63"), 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    pl.data.materials.append(m)
    render(os.path.join(saida, f"vit_{secao}_{'noite' if noite else 'dia'}.png"))


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    pasta, saida, qual = a[0], a[1], a[2]
    modos = a[3].split(",") if len(a) > 3 else ["dia"]
    os.makedirs(saida, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    c = Cena(pasta)
    luzes = []
    if qual == "encaixe":
        casas = cena_encaixe(c)
        luzes = list(c.luzes_extra)
        chao_fundo(c, 22, 8)
        alvo, dist = V((22, 5, 0)), 92
    elif qual.startswith("vit_"):
        sec = qual[4:]
        for m in modos:
            vitrine(c, sec, m == "noite", saida)
            if m != modos[-1]:
                for o in list(c.objs):
                    bpy.data.objects.remove(o, do_unlink=True)
                c.objs = []
                for o in [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith("Plane")]:
                    bpy.data.objects.remove(o, do_unlink=True)
        print("fim", flush=True)
        return
    elif qual == "lote":
        luzes = cena_lote(c)
        fd = chao_fundo(c, 0, 0)
        fd["recortavel"] = 1  # o chão do render também ganha o buraco da piscina
        c.objs.append(fd)
        recorta_gramado(c)
        alvo, dist = V((-1.5, 0.5, 1.5)), 40
    bpy.context.view_layer.update()
    json.dump({"pecas": c.registro, "recorte": getattr(c, "recorte", None), "luzes": luzes,
               "alvo": list(alvo), "dist": dist}, open(os.path.join(saida, f"casas_{qual}.json"), "w"), ensure_ascii=False)
    for m in modos:
        if m == "dia":
            luz_e_camera(alvo, dist, azim=-30, elev=0.85, lente=40)
            render(os.path.join(saida, f"{qual}_dia.png"))
        elif m == "noite":
            luz_e_camera(alvo, dist, azim=-30, elev=0.85, lente=40, noite=True, luzes=luzes)
            render(os.path.join(saida, f"{qual}_noite.png"))
        elif m.startswith("cam:"):  # cam:nome:x:y:z:dist:azim:elev:lente[:noite]
            _, nome, x, y, z, d_, az, el, le, *rest = m.split(":")
            luz_e_camera(V((float(x), float(y), float(z))), float(d_), float(az), float(el), float(le),
                         res=(1200, 900), noite=bool(rest), luzes=luzes)
            render(os.path.join(saida, f"{qual}_{nome}.png"))
        elif m == "mede":
            res = {}
            ruins = {"m_degrade_gelo"} | {"m_" + t["id"] for t in c.tex["piso"]}
            if qual == "encaixe":
                so = os.environ.get("SO_CASAS", "").split(",") if os.environ.get("SO_CASAS") else None
                for nome, sp in specs_encaixe().items():
                    if so and nome not in so:
                        continue
                    linhas = []
                    for (x0, y0, x1, y1) in sp["rects"]:
                        for k in range(math.ceil(x0), math.floor(x1) + 1):
                            linhas.append(("x", float(k), y0, y1))
                        for k in range(math.ceil(y0), math.floor(y1) + 1):
                            linhas.append(("y", float(k), x0, x1))
                    r = {}
                    if sp["rects"]:
                        r["telhado"] = mede_telhado(c, sp["rects"], passo=0.05, p_max=min(sp["p"], 3.0), linhas=linhas)
                        r["telhado"]["pior_emenda_mm"] = max([e_[2] for e_ in r["telhado"]["emendas_mm"]] or [0])
                        r["telhado"]["emendas_mm"] = [e_ for e_ in r["telhado"]["emendas_mm"] if e_[2] > 0.3]
                    hz = sp["fach"][5] - (6.1 if sp["fach"][5] > 5 else 2.9)
                    r["fachada"] = mede_fachada(c, *sp["fach"], ruins, passo=0.05,
                                                pula=[(hz + ANDAR * k - 0.005, hz + ANDAR * k + 0.035) for k in range(2)])
                    res[nome] = r
                    json.dump(res, open(os.path.join(saida, f"{qual}_medidas.json"), "w"), indent=1, ensure_ascii=False)
                    print("mede", nome, json.dumps(r, ensure_ascii=False)[:400], flush=True)
            elif qual == "lote":
                ex = BEIRAL - 0.04
                r = {"telhado": mede_telhado(c, [(-12 - ex, -3.5 - ex, -2 + ex, 4.5 + ex)], passo=0.025, p_max=0.5,
                                            linhas=[("x", float(k), -4.0, 5.0) for k in range(-12, -1)] +
                                                   [("y", float(k), -12.5, -1.5) for k in range(-4, 5)])}
                r["telhado"]["pior_emenda_mm"] = max([e_[2] for e_ in r["telhado"]["emendas_mm"]] or [0])
                r["telhado"]["emendas_mm"] = [e_ for e_ in r["telhado"]["emendas_mm"] if e_[2] > 0.3]
                r["fachada"] = mede_fachada(c, -12, -1.5, -2, 4.5, 0.04, 0.45 + 6.1, ruins)
                r["piscina"] = mede_piscina(c, *c.recorte)
                res["lote"] = r
                print("mede lote", json.dumps(r, ensure_ascii=False)[:600], flush=True)
            json.dump(res, open(os.path.join(saida, f"{qual}_medidas.json"), "w"), indent=1, ensure_ascii=False)
    print("fim", flush=True)


if __name__ == "__main__":
    main()
