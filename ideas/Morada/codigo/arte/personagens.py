"""Etapa 2 do pipeline: monta os personagens low poly sobre o esqueleto do Mixamo e exporta glTF.

Uso: python personagens.py <build/clipes.blend> <dist/> <build/familia.blend>

Cada personagem é UMA malha com UM material (a paleta 16×16), presa ao esqueleto base com
pesos por osso. Crianças e bebês usam o mesmo esqueleto em escala menor, então todas as
animações servem para todos. A aparência vem inteira da ficha de cada personagem (FAMILIA).
"""
import json
import math
import os
import sys

import bpy  # o módulo bpy precisa vir antes de bmesh
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paleta  # noqa: E402

LIB, DIST, OUT_BLEND = sys.argv[1], sys.argv[2], sys.argv[3]
P = "mixamorig:"
FRENTE, TRAS = Vector((0, -1, 0)), Vector((0, 1, 0))
CIMA, BAIXO = Vector((0, 0, 1)), Vector((0, 0, -1))

bpy.ops.wm.open_mainfile(filepath=LIB)
scn = bpy.context.scene
scn.render.fps = 30
BASE = bpy.data.objects["Esqueleto"]
BASE.data.pose_position = "REST"
bpy.context.view_layer.update()
GRUPOS = [b.name for b in BASE.data.bones]
MW = BASE.matrix_world.copy()


def H(n):
    return MW @ BASE.data.bones[P + n].head_local


def T(n):
    return MW @ BASE.data.bones[P + n].tail_local


def mid(a, b, t=0.5):
    return a.lerp(b, t)


def rnd(i):
    """Pseudoaleatório determinístico: o mesmo script gera sempre o mesmo modelo."""
    x = math.sin(i * 12.9898 + 78.233) * 43758.5453
    return x - math.floor(x)


# ================================================================= construtor de malha
class Malha:
    def __init__(self):
        self.bm = bmesh.new()
        self.dl = self.bm.verts.layers.deform.verify()
        self.cl = self.bm.faces.layers.int.new("cor")
        self.gi = {g: i for i, g in enumerate(GRUPOS)}

    def _pesos(self, verts, pesos):
        for v in verts:
            w = pesos(v.co) if callable(pesos) else pesos
            for b, val in w.items():
                v[self.dl][self.gi[P + b]] = val

    def _cor(self, faces, cor):
        for f in faces:
            f[self.cl] = paleta.indice(cor(f) if callable(cor) else cor)

    @staticmethod
    def _faces(verts):
        return list({f for v in verts for f in v.link_faces})

    def elipsoide(self, centro, raios, pesos, cor, subdiv=2, cortar=None, rot=None, deformar=None):
        M = Matrix.Translation(centro) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*raios, 1))
        verts = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=1.0, matrix=M)["verts"]
        if deformar:
            inv = M.inverted()
            for v in verts:
                v.co = M @ deformar(inv @ v.co)
        faces = self._faces(verts)
        if cortar:
            inv = M.inverted()
            fora = [f for f in faces if cortar(inv @ f.calc_center_median())]
            bmesh.ops.delete(self.bm, geom=fora, context="FACES")
            verts = [v for v in verts if v.is_valid and v.link_faces]
            faces = self._faces(verts)
        self._pesos(verts, pesos)
        self._cor(faces, cor)
        return verts

    def caixa(self, centro, tamanho, pesos, cor, rot=None):
        M = Matrix.Translation(centro) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*tamanho, 1))
        verts = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)["verts"]
        self._pesos(verts, pesos)
        self._cor(self._faces(verts), cor)
        return verts

    def cone(self, base, direcao, r1, r2, altura, pesos, cor, lados=8, achatar=1.0):
        d = direcao.normalized()
        R = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        M = Matrix.Translation(base + d * altura / 2) @ R @ Matrix.Diagonal((1, achatar, 1, 1))
        verts = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=lados, radius1=r1, radius2=r2,
                                      depth=altura, matrix=M)["verts"]
        self._pesos(verts, pesos)
        self._cor(self._faces(verts), cor)
        return verts

    def poligono(self, pontos, pesos, cor):
        verts = [self.bm.verts.new(p) for p in pontos]
        f = self.bm.faces.new(verts)
        self._pesos(verts, pesos)
        f[self.cl] = paleta.indice(cor)
        return f

    def tubo(self, pontos, raios, pesos, cores, lados=10, ref=FRENTE, tampa_ini=True, tampa_fim=True,
             faixa=None, fechado=False, xadrez=None):
        """Seção elíptica ao longo de uma cadeia. raios[i] = (lateral, frontal); cores por segmento.
        faixa: cor diferente na frente de alguns segmentos (camisa aberta, decote, peitilho).
        xadrez: segunda cor alternada (tecido xadrez)."""
        n = len(pontos)
        aneis, eixos = [], []
        for i, p in enumerate(pontos):
            if fechado:
                d = (pontos[(i + 1) % n] - pontos[(i - 1) % n]).normalized()
            else:
                d = (pontos[min(i + 1, n - 1)] - pontos[max(i - 1, 0)]).normalized()
            lado = d.cross(ref)
            if lado.length < 1e-4:
                lado = d.cross(CIMA)
            lado.normalize()
            fr = lado.cross(d).normalized()
            rs, rf = raios[i]
            anel = []
            for j in range(lados):
                a = 2 * math.pi * (j + 0.5) / lados
                v = self.bm.verts.new(p + lado * math.cos(a) * rs + fr * math.sin(a) * rf)
                w = pesos(v.co) if callable(pesos) else pesos[i]
                for b, val in w.items():
                    v[self.dl][self.gi[P + b]] = val
                anel.append(v)
            aneis.append(anel)
            eixos.append((p, fr))
        segs = n if fechado else n - 1
        for i in range(segs):
            a, b = aneis[i], aneis[(i + 1) % n]
            for j in range(lados):
                f = self.bm.faces.new((a[j], a[(j + 1) % lados], b[(j + 1) % lados], b[j]))
                c = cores[min(i, len(cores) - 1)]
                if xadrez and c == xadrez[0] and (i + j) % 2:
                    c = xadrez[1]
                if faixa and i in faixa["segmentos"]:
                    p, fr = eixos[i]
                    dirf = f.calc_center_median() - p
                    if dirf.length and dirf.normalized().dot(fr) > math.cos(math.radians(faixa["angulo"])):
                        c = faixa["cor"]
                f[self.cl] = paleta.indice(c)
        if not fechado:
            if tampa_ini:
                self.bm.faces.new(list(reversed(aneis[0])))[self.cl] = paleta.indice(cores[0])
            if tampa_fim:
                self.bm.faces.new(aneis[-1])[self.cl] = paleta.indice(cores[-1])

    def objeto(self, nome, material):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(nome)
        self.bm.to_mesh(me)
        uvl = me.uv_layers.new(name="UVMap")
        cores = [f[self.cl] for f in self.bm.faces]
        self.bm.free()
        for poly, ci in zip(me.polygons, cores):
            u, v = paleta.uv(paleta.NOMES[ci])
            for li in poly.loop_indices:
                uvl.data[li].uv = (u, v)
            poly.use_smooth = False
        me.materials.append(material)
        ob = bpy.data.objects.new(nome, me)
        for g in GRUPOS:
            ob.vertex_groups.new(name=g)
        scn.collection.objects.link(ob)
        return ob


# ================================================================= cabeça e rosto
class Cabeca:
    """Coordenadas no rosto em unidades do raio: u para a esquerda do personagem, v para cima."""

    def __init__(self, m, centro, R, mandibula=0.15, queixo=0.06):
        self.m, self.c, self.R = m, centro, R
        self.r = Vector((R, R * 0.94, R * 1.04))
        self.mand, self.queixo = mandibula, queixo

    def deformar(self, p):
        """Em coordenadas da esfera unitária: afina a mandíbula e projeta o queixo."""
        q = p.copy()
        if q.z < 0:
            t = -q.z
            q.x *= 1 - self.mand * t ** 1.6
            if q.y < 0:
                q.y *= 1 + self.queixo * t * t
            q.z *= 1 + 0.06 * t
        if q.z > 0.2:  # testa um pouco mais larga
            q.x *= 1 + 0.03 * (q.z - 0.2)
        return q

    def sup(self, u, v, desloc=0.0):
        rx, ry, rz = self.r
        y2 = max(0.0004, 1 - u * u - v * v)
        q = self.deformar(Vector((u, -math.sqrt(y2), v)))
        p = Vector((q.x * rx, q.y * ry, q.z * rz))
        n = Vector((p.x / rx ** 2, p.y / ry ** 2, p.z / rz ** 2)).normalized()
        return self.c + p + n * (desloc + 0.02) * self.R

    def decal(self, contorno, cor, desloc=0.0):
        """Recorte plano colado na superfície do rosto (olho, boca, sobrancelha, bochecha)."""
        return self.m.poligono([self.sup(u, v, desloc) for u, v in contorno], {"Head": 1}, cor)


def elipse(cu, cv, ru, rv, n=14, a0=0.0, a1=2 * math.pi):
    return [(cu + math.cos(a0 + (a1 - a0) * k / n) * ru, cv + math.sin(a0 + (a1 - a0) * k / n) * rv)
            for k in range(n if a1 - a0 >= 2 * math.pi - 1e-6 else n + 1)]


def arco_faixa(cu, cv, ru, rv, esp, a0, a1, n=8):
    ext = [(cu + math.cos(a) * (ru + esp), cv + math.sin(a) * (rv + esp))
           for a in [a0 + (a1 - a0) * k / n for k in range(n + 1)]]
    inn = [(cu + math.cos(a) * ru, cv + math.sin(a) * rv) for a in [a1 - (a1 - a0) * k / n for k in range(n + 1)]]
    return ext + inn


def rosto(m, spec, c, R):
    fem = spec.get("feminino", False)
    cab = Cabeca(m, c, R, mandibula=spec.get("mandibula", 0.22 if fem else 0.12), queixo=spec.get("queixo", 0.05))
    pele = spec["pele"]
    m.elipsoide(c, tuple(cab.r), {"Head": 1}, pele, subdiv=3, deformar=cab.deformar)
    ko = spec.get("olho", 1.0)
    ev = spec.get("olho_altura", -0.02)
    eh = 0.18 if fem else 0.155
    for s in (-1, 1):
        cu = s * 0.34
        # olho grande escuro com dois brilhos
        cab.decal(elipse(cu, ev, 0.13 * ko, eh * ko, 16), "olho")
        cab.decal(elipse(cu - s * 0.035 * ko, ev + 0.065 * ko, 0.045 * ko, 0.05 * ko, 10), "branco", 0.006)
        cab.decal(elipse(cu + s * 0.045 * ko, ev - 0.06 * ko, 0.02 * ko, 0.022 * ko, 8), "branco", 0.006)
        if spec.get("cilios", fem):
            cab.decal(arco_faixa(cu, ev, 0.13 * ko, 0.17 * ko, 0.03, math.radians(15), math.radians(165)), "olho", 0.003)
            ang = 0.0 if s > 0 else math.pi
            bx, by = cu + math.cos(ang) * 0.135 * ko, ev + 0.05 * ko
            cab.decal([(bx, by), (bx + s * 0.09, by + 0.07), (bx - s * 0.01, by + 0.06)], "olho", 0.003)
        # sobrancelha arqueada
        sv = ev + 0.27 * ko
        if fem:  # fina e arqueada
            cab.decal(arco_faixa(cu, sv - 0.09, 0.15, 0.1, 0.03, math.radians(25), math.radians(155)),
                      spec.get("sobrancelha", spec["cabelo_cor"]), 0.004)
        else:  # grossa e mais reta, com inclinação para dentro
            cab.decal([(cu - s * 0.14, sv - 0.035), (cu - s * 0.05, sv + 0.02), (cu + s * 0.15, sv + 0.01),
                       (cu + s * 0.15, sv - 0.04), (cu - s * 0.05, sv - 0.035), (cu - s * 0.14, sv - 0.08)],
                      spec.get("sobrancelha", spec["cabelo_cor"]), 0.004)
        if spec.get("bochecha", fem or spec["R"] > 0.2):
            cab.decal(elipse(s * 0.56, ev - 0.22, 0.11, 0.065, 12), "blush", 0.0)
        # orelha e brinco
        m.elipsoide(c + Vector((s * 0.98 * R, 0.02 * R, -0.05 * R)), (0.11 * R, 0.08 * R, 0.17 * R), {"Head": 1}, pele, 1)
        if spec.get("brinco"):
            m.elipsoide(c + Vector((s * 1.0 * R, -0.04 * R, -0.3 * R)), (0.06 * R,) * 3, {"Head": 1}, "ouro", 1)
    # nariz pequeno
    kn = 0.85 if fem else 1.1
    m.elipsoide(cab.sup(0, -0.16, -0.03), (0.075 * R * kn, 0.075 * R * kn, 0.07 * R * kn), {"Head": 1}, pele, 1)
    # sorriso aberto: borda de cima quase reta, de baixo em arco
    av = spec.get("boca_avanco", 0.0)
    w, top, fundo = 0.25 * spec.get("boca", 1.0), -0.33, 0.21 * spec.get("boca", 1.0)
    n = 12
    sup_ = [(-w + 2 * w * k / n, top - 0.035 * (1 - ((-w + 2 * w * k / n) / w) ** 2)) for k in range(n + 1)]
    inf_ = [(w - 2 * w * k / n, top - fundo * math.sqrt(max(0, 1 - ((w - 2 * w * k / n) / w) ** 2))) for k in range(1, n)]
    cab.decal(sup_ + inf_, "boca", av)
    if spec.get("dentes", True):
        dente = [(u * 0.88, v) for u, v in sup_] + [(u * 0.88, v - 0.07) for u, v in reversed(sup_)]
        cab.decal(dente, "branco", av + 0.004)
    cab.decal(elipse(0, top - fundo * 0.72, w * 0.5, fundo * 0.24, 10), "lingua", av + 0.004)
    return cab


# ================================================================= cabelos
def corta_rosto(p, testa=0.42):
    f, z = -p.y, p.z
    return (f > 0.2 and z < testa) or (z < -0.1 and f > -0.45) or z < -0.6


def cabelo(m, spec, c, R):
    estilo, cor = spec["cabelo"], spec["cabelo_cor"]
    cap = c + CIMA * (0.05 * R) + TRAS * (0.04 * R)
    if estilo == "tufo_menino":  # cabelinho curto rente, com redemoinho na frente
        m.elipsoide(c + CIMA * 0.05 * R, (1.04 * R, 1.01 * R, 1.06 * R), {"Head": 1}, cor, subdiv=3,
                    cortar=lambda p: (-p.y > 0.3 and p.z < 0.62) or p.z < 0.1)
        m.cone(c + Vector((0.1, -0.6, 0.85)).normalized() * 1.0 * R, Vector((0.3, -1, 0.4)), 0.15 * R, 0.0, 0.3 * R,
               {"Head": 1}, cor, 5)
        return
    if estilo == "tufo":
        m.elipsoide(c + CIMA * 0.08 * R, (1.04 * R, 1.0 * R, 1.06 * R), {"Head": 1}, cor, subdiv=3,
                    cortar=lambda p: p.z < 0.62)
        for k, (x, y) in enumerate(((0, -0.35), (0.25, -0.15), (-0.2, -0.1))):
            d = Vector((x, y, 1)).normalized()
            m.cone(c + d * 1.02 * R, d + Vector((0, -0.6, 0.2)), 0.16 * R, 0.0, 0.32 * R, {"Head": 1}, cor, 5)
        return
    testa = 0.55 if estilo in ("ondulado", "coque") else 0.42
    m.elipsoide(cap, (1.09 * R, 1.07 * R, 1.09 * R), {"Head": 1}, cor, subdiv=3, cortar=lambda p: corta_rosto(p, testa))

    def peso_longo(co):
        if co.z > c.z - 0.8 * R:
            return {"Head": 1}
        if co.z > c.z - 1.7 * R:
            return {"Head": 0.4, "Spine2": 0.6}
        return {"Spine2": 0.7, "Spine1": 0.3}

    if estilo in ("topete", "espetado"):
        # mechas grandes varridas para cima e para trás, como na referência
        n = 6 if estilo == "topete" else 8
        for k in range(n):
            x = -0.62 + 1.24 * k / (n - 1)
            alt = 0.95 - abs(x) * 0.35
            rot = Matrix.Rotation(math.radians(-38 + rnd(k) * 12), 4, "X") @ Matrix.Rotation(math.radians(-x * 35), 4, "Y")
            m.elipsoide(c + Vector((x * R, -0.45 * R, alt * R)), (0.26 * R, 0.2 * R, 0.5 * R), {"Head": 1}, cor,
                        subdiv=1, rot=rot)
        if estilo == "espetado":
            for k, d in enumerate(((0, -0.5, 1), (0.4, -0.2, 0.95), (-0.4, -0.25, 0.95), (0.2, 0.3, 1), (-0.2, 0.35, 1))):
                dv = Vector(d).normalized()
                m.cone(cap + dv * 0.9 * R, dv + Vector((0, -0.5, 0.3)), 0.26 * R, 0.0, 0.5 * R, {"Head": 1}, cor, 5)
        for s in (-1, 1):  # costeletas
            m.elipsoide(c + Vector((s * 0.93 * R, -0.18 * R, 0.05 * R)), (0.1 * R, 0.18 * R, 0.3 * R), {"Head": 1}, cor, 1)
    elif estilo == "ondulado":
        m.elipsoide(c + TRAS * 0.42 * R + BAIXO * 1.0 * R, (1.18 * R, 0.68 * R, 1.75 * R), peso_longo, cor, subdiv=3)
        for s in (-1, 1):
            m.elipsoide(c + Vector((s * 0.38 * R, -0.72 * R, 0.62 * R)), (0.5 * R, 0.32 * R, 0.3 * R), {"Head": 1}, cor, 2,
                        rot=Matrix.Rotation(math.radians(-s * 25), 4, "Y"))
            # mecha lateral contínua e ondulada, emoldurando o rosto até o peito
            pts, rr = [], []
            for k in range(9):
                z = 0.55 - k * 0.36
                x = s * (1.0 + 0.05 * math.sin(k * 1.9) + max(0, -z) * 0.07)
                fr = -0.2 + 0.07 * math.cos(k * 1.4) - max(0, -z - 0.6) * 0.12
                pts.append(c + Vector((x * R, fr * R, z * R)))
                rr.append(((0.3 + 0.05 * math.sin(k * 2.3)) * R, (0.4 - k * 0.012) * R))
            m.tubo(pts, rr, peso_longo, [cor], lados=8, ref=Vector((s, 0, 0)))
            for k in range(3):
                z = -0.5 - k * 0.55
                m.elipsoide(c + Vector((s * 0.55 * R, 0.5 * R, z * R)), (0.5 * R, 0.42 * R, 0.45 * R), peso_longo, cor, 2)
    elif estilo == "cacheado_menino":  # cachos curtos e baixos, sem franja
        i = 0
        for z in (0.95, 0.68, 0.38, 0.08):
            n = 7 if z > 0.9 else 10
            for k in range(n):
                i += 1
                a = 2 * math.pi * k / n + rnd(i) * 0.4
                rr = 1.02 * R
                x, y = math.sin(a) * rr, math.cos(a) * rr * 0.95
                if z < 0.6 and y < -0.4 * R and abs(x) < 0.85 * R:
                    continue
                if z > 0.9:
                    x, y = x * 0.5, y * 0.5
                r = (0.24 + rnd(i + 7) * 0.05) * R
                m.elipsoide(c + Vector((x, y, z * R)), (r, r, r * 0.9), {"Head": 1}, cor, 1)
    elif estilo in ("cacheado_longo", "cacheado_curto"):
        longo = estilo == "cacheado_longo"
        niveis = [0.92, 0.6, 0.25, -0.1, -0.45] + ([-0.85, -1.25, -1.65, -2.0] if longo else [])
        i = 0
        for z in niveis:
            n = 7 if z > 0.85 else 11
            for k in range(n):
                i += 1
                a = 2 * math.pi * k / n + rnd(i) * 0.4
                rr = (1.04 if z > -0.5 else 1.0 + 0.12 * min(1.5, -z)) * R
                x, y = math.sin(a) * rr, math.cos(a) * rr * 0.95
                if z < 0.62 and y < -0.42 * R and abs(x) < 0.85 * R:
                    continue  # deixa o rosto livre
                if z > 0.85:
                    x, y = x * 0.55, y * 0.55
                r = (0.29 + rnd(i + 99) * 0.06) * R
                m.elipsoide(c + Vector((x, y, z * R)), (r, r, r * 0.95), peso_longo if longo else {"Head": 1}, cor, 1)
        for k in range(5):  # franjinha de cachos
            x = -0.5 + k * 0.25
            m.elipsoide(c + Vector((x * R, -0.82 * R, 0.62 * R)), (0.2 * R,) * 3, {"Head": 1}, cor, 1)
    elif estilo == "coque":
        m.elipsoide(c + CIMA * 1.02 * R + TRAS * 0.32 * R, (0.45 * R, 0.42 * R, 0.4 * R), {"Head": 1}, cor, subdiv=2)
        for s in (-1, 1):
            m.elipsoide(c + Vector((s * 0.4 * R, -0.62 * R, 0.66 * R)), (0.5 * R, 0.3 * R, 0.26 * R), {"Head": 1}, cor, 2,
                        rot=Matrix.Rotation(math.radians(-s * 28), 4, "Y"))
    elif estilo == "curto":
        for s in (-1, 1):
            m.elipsoide(c + Vector((s * 0.92 * R, 0.1 * R, 0.05 * R)), (0.2 * R, 0.5 * R, 0.4 * R), {"Head": 1}, cor, 1)


# ================================================================= acessórios
def oculos(m, spec, c, R, forma="redondo"):
    ko = spec.get("olho", 1.0)
    for s in (-1, 1):
        cen = c + Vector((s * 0.34 * R, -1.04 * R, -0.01 * R))
        rx, rz = (0.24 * R * ko, 0.24 * R * ko) if forma == "redondo" else (0.27 * R, 0.2 * R)
        pts = [cen + Vector((math.cos(a) * rx, 0, math.sin(a) * rz)) for a in [2 * math.pi * k / 12 for k in range(12)]]
        m.tubo(pts, [(0.035 * R, 0.035 * R)] * 12, [{"Head": 1}] * 12, ["armacao"], lados=4, ref=FRENTE, fechado=True)
        m.caixa(c + Vector((s * 0.86 * R, -0.5 * R, 0.02 * R)), (0.04 * R, 0.95 * R, 0.04 * R), {"Head": 1}, "armacao")
    m.caixa(c + Vector((0, -1.06 * R, 0.04 * R)), (0.24 * R, 0.04 * R, 0.04 * R), {"Head": 1}, "armacao")


def barba(m, spec, c, R, cor, cheia=True):
    def cortar(p):
        f = -p.y
        return p.z > 0.15 or f < -0.1 or (abs(p.x) < 0.4 and p.z > -0.55 and f > 0.35)
    m.elipsoide(c + FRENTE * 0.22 * R + BAIXO * 0.42 * R, (1.0 * R, 0.86 * R, 0.72 * R), {"Head": 1}, cor, subdiv=3,
                cortar=cortar)
    # bigode
    for s in (-1, 1):
        m.elipsoide(c + Vector((s * 0.16 * R, -1.0 * R, -0.24 * R)), (0.2 * R, 0.09 * R, 0.08 * R), {"Head": 1}, cor, 1,
                    rot=Matrix.Rotation(math.radians(s * 12), 4, "Y"))


def boina(m, spec, c, R, cor):
    m.elipsoide(c + CIMA * 0.45 * R + TRAS * 0.02 * R, (1.16 * R, 1.15 * R, 0.66 * R), {"Head": 1}, cor, subdiv=3,
                cortar=lambda p: p.z < -0.08)
    m.elipsoide(c + FRENTE * 1.0 * R + CIMA * 0.42 * R, (0.78 * R, 0.42 * R, 0.08 * R), {"Head": 1}, cor, subdiv=2,
                rot=Matrix.Rotation(math.radians(-10), 4, "X"))


def laco(m, spec, c, R, cor, onde=(0.45, 0.15, 0.85)):
    p = c + Vector(onde).normalized() * 1.08 * R
    for s in (-1, 1):
        m.cone(p, Vector((s, 0, 0.3)), 0.04 * R, 0.3 * R, 0.46 * R, {"Head": 1}, cor, 6, achatar=0.45)
    m.elipsoide(p, (0.13 * R,) * 3, {"Head": 1}, cor, subdiv=1)


def tiara(m, spec, c, R, cor):
    pts = [c + Vector((math.cos(a) * 1.07 * R, math.sin(a) * 0.5 * R + 0.15 * R, 0.55 * R + math.sin(a) * 0.15 * R))
           for a in [math.pi * k / 10 for k in range(11)]]
    m.tubo(pts, [(0.05 * R, 0.05 * R)] * 11, [{"Head": 1}] * 11, [cor], lados=4, ref=CIMA)


def suspensorios(m, spec, c, R, cor):
    hips, sp1, sp2 = H("Hips"), H("Spine1"), H("Spine2")
    L = spec.get("larg", 1)
    b = spec.get("barriga", 0)
    for s in (-1, 1):
        for ly in (-1, 1):
            pts = [Vector((s * 0.075, hips.y + ly * (0.125 * L + (b if ly < 0 else 0) * 0.5), hips.z + 0.03)),
                   Vector((s * 0.075, sp1.y + ly * (0.112 * L + (b if ly < 0 else 0)), sp1.z)),
                   Vector((s * 0.078, sp2.y + ly * 0.112 * L, sp2.z)),
                   Vector((s * 0.085, sp2.y + ly * 0.07 * L, sp2.z + 0.1))]
            m.tubo(pts, [(0.018, 0.006)] * 4, [{"Hips": 1}, {"Spine1": 1}, {"Spine2": 1}, {"Spine2": 1}], [cor], lados=4)


def cinto(m, spec, c, R, cor):
    hips = H("Hips")
    L = spec.get("larg", 1)
    m.tubo([hips + CIMA * 0.005, hips + CIMA * 0.04], [(0.162 * L, 0.118 * L)] * 2, [{"Hips": 1}] * 2, [cor],
           lados=12, tampa_ini=False, tampa_fim=False)
    m.caixa(Vector((hips.x, hips.y - 0.122 * L, hips.z + 0.022)), (0.045, 0.012, 0.035), {"Hips": 1}, "ouro")


def gola(m, spec, c, R, cor):
    neck, sp2 = H("Neck"), H("Spine2")
    L = spec.get("larg", 1)
    for s in (-1, 1):
        base = Vector((s * 0.05, neck.y - 0.03 * L, neck.z - 0.03))
        m.cone(base, Vector((s * 0.6, -0.8, -0.6)), 0.05, 0.0, 0.1, {"Spine2": 0.6, "Neck": 0.4}, cor, 3, achatar=0.3)


def capuz(m, spec, c, R, cor):
    neck, sp1, sp2 = H("Neck"), H("Spine1"), H("Spine2")
    L = spec.get("larg", 1)
    pts = [neck + Vector((math.cos(a) * 0.11 * L, math.sin(a) * 0.09 * L + 0.02, -0.01 + 0.04 * max(0, math.sin(a))))
           for a in [2 * math.pi * k / 12 for k in range(12)]]
    m.tubo(pts, [(0.035, 0.035)] * 12, [{"Spine2": 0.5, "Neck": 0.5}] * 12, [cor], lados=6, ref=CIMA, fechado=True)
    m.elipsoide(neck + TRAS * 0.11 + CIMA * 0.0, (0.15 * L, 0.07 * L, 0.11 * L), {"Spine2": 0.6, "Neck": 0.4}, cor, 2)
    for s in (-1, 1):
        m.caixa(Vector((s * 0.035, sp2.y - 0.118 * L, sp2.z - 0.03)), (0.012, 0.012, 0.15), {"Spine2": 1}, "branco")
    m.caixa(Vector((0, sp1.y - 0.112 * L, (H("Spine").z + sp1.z) / 2)), (0.2 * L, 0.02, 0.1), {"Spine": 1}, spec.get("bolso", cor))


def alcas(m, spec, c, R, cor):
    sp, sp1, sp2 = H("Spine"), H("Spine1"), H("Spine2")
    L = spec.get("larg", 1)
    for s in (-1, 1):
        for ly in (-1, 1):
            pts = [Vector((s * 0.07, sp1.y + ly * 0.105 * L, sp1.z + 0.03)), Vector((s * 0.072, sp2.y + ly * 0.11 * L, sp2.z)),
                   Vector((s * 0.08, sp2.y + ly * 0.07 * L, sp2.z + 0.1))]
            m.tubo(pts, [(0.02, 0.007)] * 3, [{"Spine1": 1}, {"Spine2": 1}, {"Spine2": 1}], [cor], lados=4)
        m.elipsoide(Vector((s * 0.07, sp1.y - 0.112 * L, sp1.z + 0.03)), (0.016,) * 3, {"Spine1": 1}, "ouro", 1)
    m.caixa(Vector((0, sp.y - 0.115 * L, (sp.z + sp1.z) / 2)), (0.09, 0.012, 0.06), {"Spine": 1}, "azul_xadrez_escuro")


def gola_redonda(m, spec, c, R, cor):
    neck = H("Neck")
    L = spec.get("larg", 1)
    for s in (-1, 1):
        m.elipsoide(Vector((s * 0.045 * L, neck.y - 0.05 * L, neck.z - 0.03)), (0.05 * L, 0.035 * L, 0.018), {"Spine2": 1}, cor, 1)


def colar(m, spec, c, R, cor):
    neck, sp2 = H("Neck"), H("Spine2")
    m.elipsoide(Vector((0, sp2.y - 0.11 * spec.get("larg", 1), sp2.z + 0.02)), (0.016,) * 3, {"Spine2": 1}, cor, 1)


def bolsos(m, spec, c, R, cor):
    for s in (-1, 1):
        up, kn = H(("Left" if s > 0 else "Right") + "UpLeg"), H(("Left" if s > 0 else "Right") + "Leg")
        p = mid(up, kn, 0.55) + Vector((s * 0.075 * spec.get("membro", 1), 0, 0))
        m.caixa(p, (0.02, 0.07, 0.07), {("Left" if s > 0 else "Right") + "UpLeg": 1}, cor)


ACESSORIOS = {"oculos": oculos, "barba": barba, "boina": boina, "laco": laco, "tiara": tiara,
              "suspensorios": suspensorios, "cinto": cinto, "gola": gola, "capuz": capuz, "alcas": alcas,
              "gola_redonda": gola_redonda, "colar": colar, "bolsos": bolsos}


# ================================================================= corpo
def montar(spec):
    m = Malha()
    R, L, MB = spec["R"], spec.get("larg", 1.0), spec.get("membro", 1.0)
    pele = spec["pele"]
    hips, spine, sp1, sp2, neck, head = (H(n) for n in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"))
    ombro = mid(sp2, neck, 0.62)
    rs_ombro = abs(H("LeftArm").x - ombro.x) * 0.95
    b = spec.get("barriga", 0.0)
    pt = spec.get("peito", 0.0)
    cint = spec.get("cintura", 1.0)

    # tronco anatômico: 9 anéis, 14 lados (quadril, cintura, peito, ombros, trapézio)
    fem = spec.get("feminino", False)
    kq = 1.06 if fem else 1.0   # quadril
    ko_ = 0.94 if fem else 1.04  # ombros
    pts = [hips + BAIXO * 0.085, hips, mid(hips, spine), spine, sp1, sp2, ombro, mid(ombro, neck, 0.55), mid(ombro, neck, 0.92)]
    raios = [(0.15 * kq, 0.108), (0.166 * kq, 0.122), (0.158 * kq * cint, 0.114), (0.146 * cint, 0.105 + b),
             (0.152, 0.108 + b * 0.7 + pt * 0.6), (0.168 * ko_, 0.114 + pt), (rs_ombro / L * ko_, 0.1), (0.115, 0.078),
             (0.066, 0.062)]
    raios = [(a * L, bb * L) for a, bb in raios]
    MAPA_T = [0, 1, 1, 2, 3, 4, 5, 5]
    cores_t = [spec["tronco"][i] for i in MAPA_T]
    faixa = spec.get("faixa")
    if faixa:
        faixa = dict(faixa, segmentos=[i for i, o in enumerate(MAPA_T) if o in faixa["segmentos"]])
    m.tubo(pts, raios, [{"Hips": 1}, {"Hips": 1}, {"Hips": 0.5, "Spine": 0.5}, {"Spine": 1}, {"Spine1": 1},
                         {"Spine2": 1}, {"Spine2": 1}, {"Spine2": 0.7, "Neck": 0.3}, {"Neck": 0.5, "Spine2": 0.5}],
           cores_t, lados=14, faixa=faixa, xadrez=spec.get("xadrez"))
    m.tubo([neck, head + CIMA * 0.03], [(0.05 * L, 0.05 * L)] * 2, [{"Neck": 1}, {"Head": 1}], [pele], lados=8)

    # cabeça
    c = head + CIMA * (R * 0.8) + FRENTE * (R * 0.06)
    rosto(m, spec, c, R)
    cabelo(m, spec, c, R)
    for a in spec.get("acessorios", []):
        ACESSORIOS[a[0]](m, spec, c, R, *a[1:])

    # braços: 5 anéis, manga com punho
    for lado in ("Left", "Right"):
        sh, el, wr = H(lado + "Arm"), H(lado + "ForeArm"), H(lado + "Hand")
        rb = [(0.062, 0.058), (0.056, 0.052), (0.047, 0.045), (0.043, 0.041), (0.037, 0.035)]
        r7 = [(0.063, 0.059), (0.06, 0.058), (0.05, 0.048), (0.046, 0.044), (0.05, 0.046), (0.042, 0.039), (0.036, 0.033)]
        m.tubo([sh, mid(sh, el, 0.35), mid(sh, el, 0.8), el, mid(el, wr, 0.3), mid(el, wr, 0.75), wr],
               [(a * MB, bb * MB) for a, bb in r7],
               [{lado + "Arm": 1}, {lado + "Arm": 1}, {lado + "Arm": 1}, {lado + "Arm": 0.5, lado + "ForeArm": 0.5},
                {lado + "ForeArm": 1}, {lado + "ForeArm": 1}, {lado + "ForeArm": 0.5, lado + "Hand": 0.5}],
               [spec["braco"][i] for i in (0, 1, 1, 2, 3, 3)], xadrez=spec.get("xadrez"))
        manga = spec["braco"][0]
        kp = 1.3 if spec.get("bufante") else 1.0
        m.elipsoide(sh + Vector((0, 0, 0.005)), (0.068 * MB * kp, 0.064 * MB * kp, 0.066 * MB * kp),
                    {lado + "Arm": 0.6, lado + "Shoulder": 0.4}, manga, subdiv=2)
        if spec.get("punho"):  # barra da manga dobrada
            i = spec["punho"]
            p_ = [sh, mid(sh, el), el, mid(el, wr)][i]
            m.tubo([p_ - (el - sh).normalized() * 0.015, p_ + (el - sh).normalized() * 0.015],
                   [(rb[i][0] * MB * 1.18, rb[i][1] * MB * 1.18)] * 2,
                   [{lado + ("Arm" if i < 2 else "ForeArm"): 1}] * 2, [spec["braco"][max(0, i - 1)]], lados=10)
        # mão em luva com polegar
        km = spec.get("mao", 1.0)
        dirb = (wr - el).normalized()
        s = 1 if lado == "Left" else -1
        hc = wr + dirb * 0.055 * km
        m.elipsoide(hc, (0.07 * km, 0.058 * km, 0.038 * km), {lado + "Hand": 1}, pele, subdiv=2)
        m.elipsoide(hc + Vector((-s * 0.025 * km, -0.05 * km, 0.0)), (0.028 * km, 0.024 * km, 0.024 * km),
                    {lado + "Hand": 1}, pele, subdiv=1)

    # pernas: 5 anéis
    kpl = spec.get("perna_larg", 1.0)
    for lado in ("Left", "Right"):
        hp, kn, an = H(lado + "UpLeg"), H(lado + "Leg"), H(lado + "Foot")
        kc = 1.0 if kpl <= 1.05 else 0.0
        rl = [(0.092, 0.092), (0.087, 0.089), (0.07, 0.072), (0.06 * max(1, kpl * 0.9), 0.063 * max(1, kpl * 0.9)),
              ((0.058 + 0.008 * kc) * max(1, kpl * 0.95), (0.06 + 0.01 * kc) * max(1, kpl * 0.95)),
              (0.05 * kpl, 0.052 * kpl), (0.046 * kpl, 0.048 * kpl)]
        m.tubo([hp + CIMA * 0.02, mid(hp, kn, 0.3), mid(hp, kn, 0.78), kn, mid(kn, an, 0.3), mid(kn, an, 0.72),
                an + CIMA * 0.01], [(a * MB, bb * MB) for a, bb in rl],
               [{lado + "UpLeg": 0.7, "Hips": 0.3}, {lado + "UpLeg": 1}, {lado + "UpLeg": 1},
                {lado + "UpLeg": 0.5, lado + "Leg": 0.5}, {lado + "Leg": 1}, {lado + "Leg": 1},
                {lado + "Leg": 0.5, lado + "Foot": 0.5}], [spec["perna"][i] for i in (0, 1, 1, 2, 3, 3)], lados=12)
        if spec.get("barra"):
            m.tubo([an + CIMA * 0.03, an + CIMA * 0.075], [(0.058 * MB * kpl, 0.06 * MB * kpl)] * 2,
                   [{lado + "Leg": 0.5, lado + "Foot": 0.5}] * 2, [spec["barra"]], lados=10)
        # tênis arredondado com sola
        tb, tt = H(lado + "ToeBase"), T(lado + "ToeBase")
        d = Vector((tt.x - an.x, tt.y - an.y, 0)).normalized()
        kpe = spec.get("pe", 1.0)
        a0 = Vector((an.x, an.y, 0))
        comp = Vector((tt.x - an.x, tt.y - an.y, 0)).length
        dobra = Vector((tb.x - an.x, tb.y - an.y, 0)).dot(d)

        def peso_pe(co, an=an, d=d, dobra=dobra, lado=lado):
            return {lado + "ToeBase": 1} if Vector((co.x - an.x, co.y - an.y, 0)).dot(d) > dobra * 0.9 else {lado + "Foot": 1}
        perfil = [(-0.07, 0.048, 0.035, 0.05), (-0.03, 0.055, 0.045, 0.06), (comp * 0.45, 0.057, 0.043, 0.055),
                  (comp * 0.85, 0.055, 0.036, 0.045), (comp + 0.01, 0.045, 0.026, 0.035), (comp + 0.035, 0.022, 0.012, 0.03)]
        pts = [a0 + d * (t * kpe) + CIMA * (z * kpe) for t, _, _, z in perfil]
        m.tubo(pts, [(w * kpe, h * kpe) for _, w, h, _ in perfil], peso_pe, [spec["sapato"]], lados=10, ref=CIMA)
        pts_s = [a0 + d * ((perfil[0][0] - 0.005) * kpe) + CIMA * 0.012 * kpe,
                 a0 + d * ((perfil[-2][0] + 0.02) * kpe) + CIMA * 0.012 * kpe]
        m.tubo(pts_s, [(0.06 * kpe, 0.012 * kpe)] * 2, peso_pe, [spec.get("sola", "sola")], lados=10, ref=CIMA)

    if spec.get("saia"):
        topo, fundo, cor = spec["saia"][:3]
        roda = spec["saia"][3] if len(spec["saia"]) > 3 else 1.0
        z0, z1 = hips.z + topo, fundo
        pts = [Vector((hips.x, hips.y, z0)), Vector((hips.x, hips.y, z0 - (z0 - z1) * 0.35)), Vector((hips.x, hips.y, z1))]
        rr = [(0.158 * L, 0.118 * L), (0.2 * L * roda, 0.16 * L * roda), (0.25 * L * roda, 0.21 * L * roda)]
        m.tubo(pts, rr, [{"Hips": 1}, {"Hips": 1}, {"Hips": 0.7, "Spine": 0.3}], [cor], lados=14, tampa_ini=False,
               tampa_fim=False)
    return m


# ================================================================= a família da imagem de referência
ADULTO = dict(R=0.172, olho=1.0)
CRIANCA = dict(R=0.232, larg=1.08, membro=1.2, mao=1.25, pe=1.18, olho=1.12, mandibula=0.1)
PEQUENO = dict(R=0.262, larg=1.25, membro=1.42, mao=1.38, pe=1.32, olho=1.15, mandibula=0.07)
BEBE = dict(R=0.28, larg=1.4, membro=1.55, mao=1.42, pe=1.3, olho=1.18, dentes=False, mandibula=0.04, queixo=0.02)
ZJOELHO = H("LeftLeg").z
ZTORNOZELO = H("LeftFoot").z

FAMILIA = [
    dict(id="avo", nome="Avô Zé", k=1.12, **ADULTO, larg=1.06, barriga=0.03, pele="pele_clara", cabelo="curto",
         cabelo_cor="cabelo_grisalho", sobrancelha="barba_branca", sobrancelha_grossa=True, bochecha=True,
         tronco=["marrom", "creme", "creme", "creme", "creme", "creme"], braco=["creme", "pele_clara", "pele_clara", "pele_clara"],
         punho=1, perna=["marrom"] * 4, sapato="marrom_escuro", sola="marrom_escuro", boca_avanco=0.14,
         acessorios=[("barba", "barba_branca"), ("oculos", "quadrado"), ("boina", "bege_boina"), ("gola", "creme"),
                     ("suspensorios", "marrom_escuro"), ("cinto", "marrom_escuro")]),
    dict(id="avo_lurdes", feminino=True, nome="Vó Lurdes", k=1.03, **ADULTO, larg=0.98, membro=0.95, peito=0.01, pele="pele_clara",
         cabelo="coque", cabelo_cor="cabelo_grisalho", sobrancelha="cabelo_grisalho", brinco=True, cilios=True,
         tronco=["roxo"] * 6, faixa=dict(cor="creme", segmentos=[2, 3, 4, 5], angulo=30), braco=["roxo"] * 4,
         perna=["roxo"] * 4, sapato="marrom", saia=(0.06, ZTORNOZELO + 0.06, "roxo", 1.0),
         acessorios=[("oculos", "redondo"), ("colar", "ouro")]),
    dict(id="pai", nome="Rafa", k=1.22, **ADULTO, larg=1.1, membro=1.08, pele="pele_media", cabelo="topete",
         cabelo_cor="cabelo_escuro", sobrancelha_grossa=True, bochecha=False,
         tronco=["azul_marinho"] + ["azul_xadrez"] * 5, xadrez=("azul_xadrez", "azul_xadrez_escuro"),
         faixa=dict(cor="branco_roupa", segmentos=[1, 2, 3, 4, 5], angulo=24),
         braco=["azul_xadrez", "azul_xadrez", "azul_xadrez", "pele_media"], punho=3, perna=["azul_marinho"] * 4,
         sapato="branco_roupa", boca_avanco=0.16, acessorios=[("barba", "cabelo_escuro"), ("gola", "azul_xadrez")]),
    dict(id="mae", feminino=True, nome="Lu", k=1.15, **ADULTO, larg=0.93, membro=0.9, cintura=0.88, peito=0.02, pele="pele_media",
         cabelo="ondulado", cabelo_cor="cabelo_castanho", brinco=True, cilios=True,
         tronco=["bege_calca"] + ["amarelo"] * 5, faixa=dict(cor="pele_media", segmentos=[5], angulo=40),
         braco=["amarelo", "pele_media", "pele_media", "pele_media"], perna=["bege_calca"] * 4, perna_larg=1.45,
         sapato="sandalia", sola="sandalia"),
    dict(id="adolescente", nome="Téo", k=1.16, **ADULTO, larg=1.02, pele="pele_morena", cabelo="espetado",
         cabelo_cor="cabelo_escuro", sobrancelha_grossa=True, bochecha=False,
         tronco=["azul_marinho"] + ["verde"] * 5, braco=["verde"] * 4, punho=3, perna=["azul_marinho"] * 4,
         sapato="verde", bolso="verde_escuro", acessorios=[("capuz", "verde")]),
    dict(id="jovem", feminino=True, nome="Bia", k=1.12, **ADULTO, larg=0.9, membro=0.88, cintura=0.86, peito=0.02, pele="pele_media",
         cabelo="ondulado", cabelo_cor="cabelo_castanho", brinco=True, cilios=True, tronco=["jeans"] + ["rosa"] * 5,
         braco=["rosa", "pele_media", "pele_media", "pele_media"], perna=["jeans"] * 4, barra="jeans_claro",
         sapato="branco_roupa", acessorios=[("cinto", "marrom_escuro")]),
    dict(id="menina", feminino=True, nome="Nina", k=0.68, **CRIANCA, pele="pele_media", cabelo="cacheado_longo",
         cabelo_cor="cabelo_castanho", cilios=True, tronco=["amarelo"] * 6,
         braco=["amarelo", "pele_media", "pele_media", "pele_media"], bufante=True,
         perna=["pele_media", "pele_media", "pele_media", "branco"], sapato="amarelo",
         saia=(0.07, ZJOELHO + 0.06, "amarelo", 1.15), acessorios=[("laco", "amarelo")]),
    dict(id="menino_pequeno", nome="Gui", k=0.5, **PEQUENO, pele="pele_media", cabelo="cacheado_menino",
         cabelo_cor="cabelo_castanho",
         tronco=["azul_macacao", "azul_macacao", "azul_macacao", "azul_claro", "azul_claro", "azul_claro"],
         faixa=dict(cor="azul_macacao", segmentos=[3], angulo=50), braco=["azul_claro", "pele_media", "pele_media", "pele_media"],
         perna=["azul_macacao"] * 4, barra="azul_macacao", sapato="branco_roupa", acessorios=[("alcas", "azul_macacao")]),
    dict(id="menina_pequena", feminino=True, nome="Mel", k=0.5, **PEQUENO, pele="pele_media", cabelo="cacheado_curto",
         cabelo_cor="cabelo_castanho", cilios=True, tronco=["rosa"] * 6, braco=["rosa", "pele_media", "pele_media", "pele_media"],
         bufante=True, perna=["pele_media", "pele_media", "pele_media", "branco"], sapato="rosa",
         saia=(0.07, ZJOELHO + 0.03, "rosa", 1.2), acessorios=[("laco", "rosa", (0.0, 0.15, 1.0)), ("gola_redonda", "branco")]),
    dict(id="menino", nome="Caio", k=0.72, **CRIANCA, pele="pele_media", cabelo="topete", cabelo_cor="cabelo_castanho_claro",
         tronco=["caqui"] + ["branco_roupa"] * 5, braco=["azul_raglan", "pele_media", "pele_media", "pele_media"],
         perna=["caqui", "caqui", "pele_media", "branco"], perna_larg=1.0, sapato="azul_raglan",
         acessorios=[("bolsos", "caqui_escuro")]),
    dict(id="bebe_menino", nome="Davi", k=0.36, **BEBE, pele="pele_bebe", cabelo="tufo_menino", cabelo_cor="cabelo_castanho",
         tronco=["azul_claro"] * 6, braco=["azul_claro", "azul_claro", "azul_claro", "pele_bebe"],
         perna=["azul_claro", "azul_claro", "azul_claro", "branco"], sapato="branco"),
    dict(id="bebe_menina", feminino=True, nome="Lia", k=0.36, **BEBE, pele="pele_bebe", cabelo="tufo", cabelo_cor="cabelo_castanho",
         cilios=True, tronco=["rosa_claro"] * 6, braco=["rosa_claro", "pele_bebe", "pele_bebe", "pele_bebe"],
         perna=["pele_bebe", "pele_bebe", "branco", "branco"], sapato="branco",
         saia=(0.07, ZJOELHO + 0.12, "rosa_claro", 1.25), acessorios=[("tiara", "rosa"), ("laco", "rosa", (0.35, -0.1, 0.95))]),
]

# ================================================================= material único
os.makedirs(os.path.join(DIST, "personagens"), exist_ok=True)
img = paleta.gerar_imagem(bpy, os.path.join(DIST, "paleta.png"))
mat = bpy.data.materials.new("paleta")
if hasattr(mat, "use_nodes"):
    mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
tex.interpolation = "Closest"
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.8
mat.use_backface_culling = False

# ================================================================= montar todos
relatorio = []
for spec in FAMILIA:
    arm = BASE.copy()  # objeto novo, mesmo esqueleto (dados compartilhados)
    arm.name = spec["id"]
    arm.animation_data_clear()
    scn.collection.objects.link(arm)
    BASE.data.pose_position = "REST"
    bpy.context.view_layer.update()
    ob = montar(spec).objeto(spec["id"] + "_malha", mat)
    BASE.data.pose_position = "POSE"
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    ob.modifiers.new("Esqueleto", "ARMATURE").object = arm
    arm.scale = BASE.scale * spec["k"]
    arm["nome"] = spec["nome"]
    arm["ficha"] = json.dumps({k: v for k, v in spec.items() if k not in ("id",)}, ensure_ascii=False, default=str)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    relatorio.append({"id": spec["id"], "nome": spec["nome"], "escala": spec["k"], "triangulos": tris,
                      "vertices": len(ob.data.vertices)})
    print(f"{spec['id']:16} {spec['nome']:10} tris={tris:5} verts={len(ob.data.vertices)}", flush=True)

BASE.data.pose_position = "POSE"
bpy.context.view_layer.update()


def exportar(objs, caminho, animacoes):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=caminho, export_format="GLB", use_selection=True,
                              export_animations=animacoes, export_animation_mode="ACTIONS",
                              export_skins=True, export_optimize_animation_size=True, export_yup=True)


for spec in FAMILIA:
    caminho = os.path.join(DIST, "personagens", spec["id"] + ".glb")
    exportar([bpy.data.objects[spec["id"]], bpy.data.objects[spec["id"] + "_malha"]], caminho, False)
    next(r for r in relatorio if r["id"] == spec["id"])["kb"] = round(os.path.getsize(caminho) / 1024, 1)

with open(os.path.join(DIST, "personagens.json"), "w") as f:
    json.dump(relatorio, f, ensure_ascii=False, indent=2)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
print("ok", OUT_BLEND)
