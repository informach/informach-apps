"""Expressões faciais do Morada a partir do rosto do pacote (ITHappy).

Cada expressão é uma malha de rosto inteira (olhos, sobrancelhas, boca), como as emoções do próprio pacote: no jogo,
trocar de expressão é mostrar uma malha e esconder a outra. O que existe no rosto original é reaproveitado e só
transformado no plano do rosto (sobrancelhas giram e sobem, a boca curva, os olhos crescem ou achatam), mantendo a
altura de cada ponto sobre a pele. O que não existe é desenhado com as mesmas medidas e cores: olhos fechados em arco,
olhos "> <" e boca aberta.

Coordenadas: repouso do esqueleto, x para a direita de quem olha, z para cima, a frente do rosto é -y.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ESCURO = (0.871, 0.086)  # olhos e traços (paleta)
Z_OLHO, Z_SOBR = 1.604, 1.62

# nome: (rótulo, parâmetros). Lados: "e" = esquerda de quem olha (x<0), "d" = direita.
EXPRESSOES = {
    "neutro": ("Neutro", {}),
    "feliz": ("Feliz", {"olhos": "arco", "sobr": {"dz": 0.003}, "boca": {"curva": 0.6, "larg": 1.1}}),
    "triste": ("Triste", {"olhos": {"s": 0.92}, "sobr": {"ang": 16, "dz": 0.002}, "boca": {"curva": -2.0, "larg": 0.8}}),
    "bravo": ("Bravo", {"olhos": {"s": 0.95}, "sobr": {"ang": -27, "dz": -0.004}, "boca": {"curva": -1.7, "larg": 0.85}}),
    "confiante": ("Confiante", {"sobr_e": {"ang": -4, "dz": 0.005}, "sobr_d": {"ang": -10, "dz": -0.002},
                                 "boca": {"curva": -0.7, "lado": 1.6, "larg": 0.95}}),
    "serio": ("Sério", {"olhos": {"s": 0.92}, "sobr": {"reta": 0.9, "dz": -0.004},
                        "boca": {"curva": -1.0, "larg": 0.75}}),
    "surpreso": ("Surpreso", {"olhos": {"s": 1.18}, "sobr": {"dz": 0.007}, "boca": "o"}),
    "assustado": ("Assustado", {"olhos": "seta", "sobr": {"ang": 12, "dz": 0.005}, "boca": "aberta"}),
    "aborrecido": ("Aborrecido", {"olhos": "arco", "sobr": {"ang": -12, "dz": -0.002}, "boca": {"curva": -1.6, "larg": 0.7}}),
    "confuso": ("Confuso", {"sobr_e": {"ang": 8, "dz": 0.006}, "sobr_d": {"dz": -0.001}, "boca": {"onda": 1.0, "larg": 0.85}}),
    # olhos fechados (pálpebra curvada para baixo) e boca relaxada
    # choro: olhos apertados, sobrancelhas aflitas, boca aberta e lágrimas
    "chorando": ("Chorando", {"olhos": "seta", "sobr": {"ang": 20, "dz": 0.003}, "boca": "choro", "lagrimas": True}),
    "dormindo": ("Dormindo", {"olhos": "fechado", "sobr": {"dz": -0.001}, "boca": {"curva": 0.2, "larg": 0.8}}),
}


def _ilhas(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    vis, res = set(), []
    for v in bm.verts:
        if v.index in vis:
            continue
        st, il = [v], []
        while st:
            x = st.pop()
            if x.index in vis:
                continue
            vis.add(x.index)
            il.append(x.index)
            st += [e.other_vert(x) for e in x.link_edges]
        res.append(il)
    bm.free()
    return res


class Rosto:
    def __init__(self, corpo, rosto, feminino):
        self.feminino = feminino
        P = [corpo.matrix_world @ v.co for v in corpo.data.vertices]
        self.bvh = BVHTree.FromPolygons([tuple(p) for p in P], [tuple(p.vertices) for p in corpo.data.polygons])
        self.rosto = rosto
        self.W = np.array([rosto.matrix_world @ v.co for v in rosto.data.vertices])
        self.h0 = np.array([self.altura(p) for p in self.W])
        self.partes = {"olho_e": [], "olho_d": [], "sobr_e": [], "sobr_d": [], "boca": []}
        for il in _ilhas(rosto.data):
            c = self.W[il].mean(0)
            if c[2] > Z_SOBR:
                self.partes["sobr_e" if c[0] < 0 else "sobr_d"].append(il)
            elif abs(c[2] - Z_OLHO) < 0.012 and abs(c[0]) > 0.02:
                self.partes["olho_e" if c[0] < 0 else "olho_d"].append(il)
            else:
                self.partes["boca"].append(il)
        boca = np.concatenate([self.W[il] for il in self.partes["boca"]])
        self.boca_c = boca.mean(0)
        self.boca_w = np.ptp(boca[:, 0])
        # curvatura da boca original: z = c·x² + d (ajuste por mínimos quadrados)
        x = boca[:, 0] - self.boca_c[0]
        self.curv = np.polyfit(x, boca[:, 2], 2)[0]
        self.olho = {k: self.W[self.partes[k][0]].mean(0) for k in ("olho_e", "olho_d")}
        uv = rosto.data.uv_layers.active.data
        self.uv_lab = None
        if feminino:
            idx = {i for il in self.partes["boca"] for i in il}
            lab = [d.uv[:] for p in rosto.data.polygons for li, d in zip(p.loop_indices, [uv[i] for i in p.loop_indices])
                   if p.vertices[0] in idx]
            self.uv_lab = tuple(np.mean(lab, 0)) if lab else (0.008, 0.573)

    # distância da pele até o ponto, medida na direção da frente (-y)
    def pele(self, x, z):
        h = self.bvh.ray_cast(Vector((x, -0.5, z)), Vector((0, 1, 0)), 1.0)
        return h[0]

    def altura(self, p):
        s = self.pele(p[0], p[2])
        return 0.0 if s is None else s.y - p[1]

    def sobre(self, x, z, h):
        s = self.pele(x, z)
        return None if s is None else Vector((x, s.y - h, z))

    # ---------------------------------------------------------------- peças originais transformadas
    def transforma(self, ils, f):
        """f(x, z, h) -> (x, z, h) aplicado a cada ponto; devolve posições novas."""
        out = {}
        for il in ils:
            for i in il:
                p, h = self.W[i], self.h0[i]
                x, z, h2 = f(p[0], p[2], h)
                q = self.sobre(x, z, h2)
                out[i] = q if q is not None else Vector(p)
        return out

    # ---------------------------------------------------------------- peças desenhadas
    def fita(self, pts, larg, uv, h=0.0016, bojo=0.0009, fechada=False, ponta=0.45):
        """Traço arredondado ao longo de uma linha (x, z), como os traços do rosto do pacote."""
        pts = [np.array(p, float) for p in pts]
        n = len(pts)
        cortes = [-1, -0.5, 0, 0.5, 1]
        verts, faces = [], []
        for k, p in enumerate(pts):
            a = pts[(k + 1) % n] if fechada else pts[min(k + 1, n - 1)]
            b = pts[(k - 1) % n] if fechada else pts[max(k - 1, 0)]
            t = a - b
            t /= np.linalg.norm(t) + 1e-9
            nrm = np.array([-t[1], t[0]])
            u = k / (n - 1)
            w = larg / 2
            if not fechada:
                w *= ponta + (1 - ponta) * math.sin(math.pi * u) ** 0.35
            for c in cortes:
                q = p + nrm * c * w
                verts.append((q[0], q[1], h + bojo * (1 - c * c)))
        m = len(cortes)
        for k in range(n if fechada else n - 1):
            k2 = (k + 1) % n
            for j in range(m - 1):
                faces.append((k * m + j, k * m + j + 1, k2 * m + j + 1, k2 * m + j))
        return verts, faces, uv

    def disco(self, cx, cz, rx, rz, uv, h=0.0014, bojo=0.0012, aneis=5, seg=28):
        verts, faces = [(cx, cz, h + bojo)], []
        for r in range(1, aneis + 1):
            t = r / aneis
            for s in range(seg):
                a = 2 * math.pi * s / seg
                verts.append((cx + rx * t * math.cos(a), cz + rz * t * math.sin(a), h + bojo * (1 - t * t)))
        for s in range(seg):
            faces.append((0, 1 + s, 1 + (s + 1) % seg))
        for r in range(1, aneis):
            b0, b1 = 1 + (r - 1) * seg, 1 + r * seg
            for s in range(seg):
                s2 = (s + 1) % seg
                faces.append((b0 + s, b1 + s, b1 + s2, b0 + s2))
        return verts, faces, uv


def _cor_paleta(paleta, alvo):
    """uv da paleta (na coluna mais à esquerda, dos vermelhos) com a cor mais próxima de alvo."""
    A = paleta
    melhor = None
    for v in np.linspace(0.02, 0.98, 97):
        for u in (0.008, 0.02, 0.03):
            c = A[int((1 - v) * 1023), int(u * 1023)].astype(float)
            d = np.linalg.norm(c - np.array(alvo))
            if melhor is None or d < melhor[0]:
                melhor = (d, (u, v))
    return melhor[1]


def _cor_paleta_toda(paleta, alvo):
    """uv da paleta inteira com a cor mais próxima de alvo."""
    melhor = None
    for v in np.linspace(0.01, 0.99, 120):
        for u in np.linspace(0.01, 0.99, 120):
            c = paleta[int((1 - v) * 1023), int(u * 1023)].astype(float)
            d = np.linalg.norm(c - np.array(alvo))
            if melhor is None or d < melhor[0]:
                melhor = (d, (u, v))
    return melhor[1]


def gerar(corpo, rosto, arm, feminino, material, paleta, prefixo):
    """Cria uma malha por expressão (a 'neutro' é o rosto original). Devolve {nome: objeto}."""
    R = Rosto(corpo, rosto, feminino)
    uv_boca_dentro = _cor_paleta(paleta, (120, 28, 38))
    uv_lingua = _cor_paleta(paleta, (214, 92, 96))
    uv_lagrima = _cor_paleta_toda(paleta, (120, 190, 240))
    uv_traco = R.uv_lab if feminino else ESCURO
    res = {"neutro": rosto}
    larg_olho = 0.022
    for nome, (rot, cfg) in EXPRESSOES.items():
        if nome == "neutro":
            continue
        novos = {}
        pecas = []  # (verts em (x, z, h), faces, uv)

        # olhos
        ol = cfg.get("olhos")
        if ol == "arco":
            for k, c in R.olho.items():
                pts = [(c[0] + x, c[2] - 0.0045 + 0.0085 * (1 - (x / 0.0105) ** 2)) for x in np.linspace(-0.0105, 0.0105, 13)]
                pecas.append(R.fita(pts, 0.0036, ESCURO))
        elif ol == "fechado":
            for k, c in R.olho.items():
                pts = [(c[0] + x, c[2] + 0.0015 - 0.0055 * (1 - (x / 0.0105) ** 2)) for x in np.linspace(-0.0105, 0.0105, 13)]
                pecas.append(R.fita(pts, 0.0030, ESCURO))
        elif ol == "seta":
            for k, c in R.olho.items():
                d = 1 if k == "olho_e" else -1  # ">" à esquerda de quem olha, "<" à direita
                pts = [(c[0] - d * 0.0075, c[2] + 0.0075), (c[0] + d * 0.006, c[2]), (c[0] - d * 0.0075, c[2] - 0.0075)]
                fino = [tuple(np.array(pts[0]) + (np.array(pts[1]) - np.array(pts[0])) * t) for t in np.linspace(0, 1, 6)]
                fino += [tuple(np.array(pts[1]) + (np.array(pts[2]) - np.array(pts[1])) * t) for t in np.linspace(0, 1, 6)[1:]]
                pecas.append(R.fita(fino, 0.0034, ESCURO))
        else:
            o = ol or {}
            for k in ("olho_e", "olho_d"):
                c = R.olho[k]
                s, sz, dz = o.get("s", 1.0), o.get("sz", 1.0), o.get("dz", 0.0)
                novos.update(R.transforma(R.partes[k], lambda x, z, h, c=c, s=s, sz=sz, dz=dz:
                                          (c[0] + (x - c[0]) * s, c[2] + (z - c[2]) * s * sz + dz, h * s)))

        # sobrancelhas
        for lado in ("e", "d"):
            k = "sobr_" + lado
            o = dict(cfg.get("sobr", {}))
            o.update(cfg.get(k, {}))
            ils = R.partes[k]
            pts = np.concatenate([R.W[il] for il in ils])
            c = pts.mean(0)
            # ângulo positivo sobe a ponta de dentro (perto do nariz)
            a = math.radians(o.get("ang", 0.0)) * (1 if lado == "e" else -1)
            reta, dz = o.get("reta", 0.0), o.get("dz", 0.0)
            ca, cb, _ = np.polyfit(pts[:, 0] - c[0], pts[:, 2], 2)  # arco e inclinação da sobrancelha
            m2 = np.mean((pts[:, 0] - c[0]) ** 2)

            def f(x, z, h, c=c, a=a, reta=reta, dz=dz, ca=ca, cb=cb, m2=m2):
                dx = x - c[0]
                dzz = (z - c[2]) - reta * (ca * (dx * dx - m2) + cb * dx)  # reta = 1: sobrancelha reta e na horizontal
                return (c[0] + dx * math.cos(a) - dzz * math.sin(a), c[2] + dx * math.sin(a) + dzz * math.cos(a) + dz, h)
            novos.update(R.transforma(ils, f))

        # boca
        b = cfg.get("boca", {})
        bc = R.boca_c
        if cfg.get("lagrimas"):  # uma gota embaixo de cada olho, escorrendo pela bochecha
            for k_, c_ in R.olho.items():
                d_ = 1 if k_ == "olho_e" else -1
                pecas.append(R.disco(c_[0] + d_ * 0.004, c_[2] - 0.016, 0.0032, 0.0048, uv_lagrima, h=0.0016, bojo=0.0012))
                pecas.append(R.disco(c_[0] + d_ * 0.006, c_[2] - 0.028, 0.0026, 0.0038, uv_lagrima, h=0.0016, bojo=0.0010))
        if b in ("o", "aberta", "choro"):
            rx, rz = {"o": (0.0105, 0.0125), "aberta": (0.0135, 0.0145), "choro": (0.0165, 0.0115)}[b]
            cz = bc[2] - {"o": 0.002, "aberta": 0.004, "choro": 0.005}[b]
            borda = [(bc[0] + rx * math.cos(t), cz + rz * math.sin(t) * (1 + (0.35 * math.sin(t) if b == "choro" else 0)))
                     for t in np.linspace(0, 2 * math.pi, 30, endpoint=False)]  # choro: mais aberta embaixo
            pecas.append(R.disco(bc[0], cz, rx * 0.95, rz * 0.95, uv_boca_dentro, h=0.0012, bojo=0.0006))
            if b in ("aberta", "choro"):
                pecas.append(R.disco(bc[0], cz - rz * 0.45, rx * 0.55, rz * 0.32, uv_lingua, h=0.0019, bojo=0.0005))
            pecas.append(R.fita(borda, 0.0042 if feminino else 0.0034, uv_traco, h=0.0018, bojo=0.0011, fechada=True))
        else:
            curva, larg = b.get("curva", 0.0), b.get("larg", 1.0)
            lado, onda = b.get("lado", 0.0), b.get("onda", 0.0)
            meia = R.boca_w / 2

            def f(x, z, h, curva=curva, larg=larg, lado=lado, onda=onda):
                dx = x - bc[0]
                t = dx / meia
                z2 = z + curva * R.curv * dx * dx
                z2 += lado * 0.0055 * max(0.0, t) ** 2 - lado * 0.001 * max(0.0, -t)
                z2 += onda * 0.0022 * math.sin(t * math.pi * 1.5)
                return (bc[0] + dx * larg, bc[2] + (z2 - bc[2]), h)
            novos.update(R.transforma(R.partes["boca"], f))

        # malha da expressão: cópia do rosto com as peças transformadas + peças desenhadas
        me = rosto.data.copy()
        me.name = f"{prefixo}_{nome}"
        mi = rosto.matrix_world.inverted()
        apagar = set()
        if ol in ("arco", "seta", "fechado"):
            apagar |= {i for k in ("olho_e", "olho_d") for il in R.partes[k] for i in il}
        if b in ("o", "aberta", "choro"):
            apagar |= {i for il in R.partes["boca"] for i in il}
        for i, p in novos.items():
            me.vertices[i].co = mi @ p
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in apagar], context="VERTS")
        uvl = bm.loops.layers.uv.active
        dl = bm.verts.layers.deform.verify()
        g_head = rosto.vertex_groups["Head"].index
        for verts, faces, uv in pecas:
            bv = []
            for (x, z, h) in verts:
                q = R.sobre(x, z, h)
                if q is None:
                    q = Vector((x, -0.1, z))
                v = bm.verts.new(mi @ q)
                v[dl][g_head] = 1.0
                bv.append(v)
            for fc in faces:
                try:
                    f = bm.faces.new([bv[i] for i in fc])
                except ValueError:
                    continue
                for l in f.loops:
                    l[uvl].uv = uv
                f.normal_update()
                if (rosto.matrix_world.to_3x3() @ f.normal).y > 0:  # a face tem que olhar para a frente (-y)
                    f.normal_flip()
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(f"{prefixo}_{nome}", me)
        bpy.context.scene.collection.objects.link(ob)
        ob.matrix_world = rosto.matrix_world.copy()
        for vg in rosto.vertex_groups:
            ob.vertex_groups.new(name=vg.name)
        ob.parent = arm
        ob.matrix_world = rosto.matrix_world.copy()
        m = ob.modifiers.new("Esqueleto", "ARMATURE")
        m.object = arm
        me.materials.clear()
        me.materials.append(material)
        res[nome] = ob
    return res
