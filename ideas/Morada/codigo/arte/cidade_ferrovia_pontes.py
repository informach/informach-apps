"""Cidade do Morada: ferrovia (trilhos, bonde, estação, trem em tubo) e pontes.

Uso:
  blender-venv/bin/python -I morada-art/cidade_ferrovia_pontes.py -- SP/cidade_out [ferrovia|pontes|<ids>...]

Convenções próprias desta parte (além das da cidade_base):
- Ferrovia de LINHA SIMPLES, centrada na quadra (como o eixo da rua): o trilho reto corre em Y no x = 0. Bitola de
  1,60 m; brita sobre a grama (topo em z = 0,10), dormentes de 2,50 m a cada 0,75 m (20 por quadra, com meio passo
  nas bordas: o desenho continua na quadra vizinha) e boleto dos trilhos em z = 0,31.
- Plataforma de estação a 1,35 m do chão (1,04 m acima do trilho).
- Rua elevada (pontes e tabuleiro do trem): topo da calçada em Z_EL = 7,50 m, asfalto 0,10 abaixo; vão livre de
  6,2 m sob a viga. As pontas das pontes usam o perfil cb.RUA (ou cb.AVENIDA) nessa altura.
- Bonde: dois trilhos de bonde (um por faixa, no centro de cada faixa, x = ±1,825), embutidos no asfalto (z = −0,10)
  ou na grama no mesmo nível, então o bonde passa da rua para a grama sem degrau.
- Curvas de 2 × 2 quadras (trilho, bonde na rua, bonde na grama, trem em tubo): raio de 22,5 m, centro no canto
  (+15, −15), entram pelo sul em x = −7,5 e saem pelo leste em y = +7,5. O tracejado da rua na curva tem o período
  ajustado para um número inteiro de traços, com as bordas no meio de um vão, como nas retas.
- Rampas (passagem de nível) ganham malha de colisão (Item.colisao_malha) em vez de caixas em degrau.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
H, Q = cb.H, cb.Q
Z_EL = 7.5

# trilho de trem
X_TR = 0.80 + 0.035          # centro do boleto (bitola 1,60 entre as faces internas)
Z_BRITA = 0.10
Z_DORM0, Z_DORM1 = 0.05, 0.17
Z_TR = Z_DORM1 + 0.14        # topo do boleto (0,31)
PASSO_DORM = 0.75
Z_PLAT = 1.35
# bonde
X_BONDE = 1.825


# ---------------------------------------------------------------------------------------------------------------------
# primitivas que faltam na base
# ---------------------------------------------------------------------------------------------------------------------
def _frames(pts, n0=None, fechado=False):
    pts = [V(p) for p in pts]
    n = len(pts)
    T = []
    for i in range(n):
        if fechado:
            a, b = pts[(i - 1) % n], pts[(i + 1) % n]
        elif n >= 3 and i in (0, n - 1):  # ponta: estimativa de 2ª ordem (num arco dá a tangente certa)
            if i == 0:
                d1, d2 = pts[1] - pts[0], pts[2] - pts[0]
            else:
                d1, d2 = pts[-1] - pts[-2], pts[-1] - pts[-3]
            T.append((d1.normalized() * 2 - d2.normalized()).normalized())
            continue
        else:
            a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        T.append((b - a).normalized())
    if n0 is None:
        n0 = V((0, 0, 1)).cross(T[0])
        if n0.length < 1e-6:
            n0 = V((0, 1, 0))
    n0 = V(n0)
    n0 = (n0 - T[0] * n0.dot(T[0])).normalized()
    N = [n0]
    for i in range(1, n):
        q = T[i - 1].rotation_difference(T[i])
        v = q @ N[-1]
        N.append((v - T[i] * v.dot(T[i])).normalized())
    hol = 0.0
    if fechado:  # o que falta girar para o último quadro casar com o primeiro
        q = T[-1].rotation_difference(T[0])
        v = q @ N[-1]
        v = (v - T[0] * v.dot(T[0])).normalized()
        hol = math.atan2(T[0].dot(v.cross(N[0])), v.dot(N[0]))
    return pts, T, N, hol


def varre(pts, secao, cor="branco", mat="atlas", n0=None, escala=None, torcao=None, tampas=True, liso=True,
          angulo=40, fechado=False, voltas=0, nome="varre"):
    """Varre uma seção 2D fechada [(u, v)] ao longo de uma linha 3D. u = lado esquerdo (N), v = T × N (para cima numa
    linha horizontal). Quadros por transporte paralelo (sem torção espúria). escala(t) -> (su, sv); torcao(t) em
    radianos; t de 0 a 1 pelo comprimento. fechado=True fecha o laço (corrige a holonomia e soma 'voltas' voltas)."""
    pts, T, N, hol = _frames(pts, n0, fechado)
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + (b - a).length)
    tot = s[-1] + ((pts[0] - pts[-1]).length if fechado else 0)
    bm = bmesh.new()
    aneis = []
    for i, p in enumerate(pts):
        nn = N[i]
        bb = T[i].cross(nn)
        t = s[i] / tot if tot else 0
        su, sv = escala(t) if escala else (1, 1)
        ang = torcao(t) if torcao else 0.0
        if fechado:
            ang += (hol + 2 * math.pi * voltas) * t
        c, sn = math.cos(ang), math.sin(ang)
        anel = []
        for u, v in secao:
            u, v = u * su, v * sv
            anel.append(bm.verts.new(p + nn * (u * c - v * sn) + bb * (u * sn + v * c)))
        aneis.append(anel)
    m = len(secao)
    pares = list(zip(aneis, aneis[1:])) + ([(aneis[-1], aneis[0])] if fechado else [])
    for a, b in pares:
        for k in range(m):
            bm.faces.new((a[k], a[(k + 1) % m], b[(k + 1) % m], b[k]))
    if tampas and not fechado:
        fs = [bm.faces.new(aneis[0][::-1]), bm.faces.new(aneis[-1])]
        bmesh.ops.triangulate(bm, faces=fs, quad_method="BEAUTY", ngon_method="BEAUTY")
    return mb._obj(nome, bm, cor, mat, liso=liso, angulo=angulo)


def caixa(*a, **k):
    """mb.caixa com boleado de 1 segmento por padrão (as peças da cidade são vistas de longe; malha leve)."""
    k.setdefault("seg", 1)
    return mb.caixa(*a, **k)


def cilindro(*a, **k):
    r = a[0] if a else k["r"]
    if r < 0.06:  # postes e montantes finos: sem boleado, poucos lados
        k.setdefault("bisel", 0.0)
        k["seg"] = min(k.get("seg", 8), 8)
    k["seg"] = min(k.get("seg", 12), 14)
    return mb.cilindro(*a, **k)


def esfera(*a, **k):
    k["seg"] = min(k.get("seg", 12), 14)
    return mb.esfera(*a, **k)


def sec_ret(l, a, r=0.0, seg=2, cu=0.0, cv=0.0):
    """Seção retangular l (u) × a (v) com cantos de raio r, centrada em (cu, cv)."""
    return [(x + cu, y + cv) for x, y in mb.ret_arredondado(l, a, r, seg)] if r > 0 else \
        [(cu - l / 2, cv - a / 2), (cu + l / 2, cv - a / 2), (cu + l / 2, cv + a / 2), (cu - l / 2, cv + a / 2)]


def sec_circ(r, n=8, cu=0.0, cv=0.0):
    return [(cu + r * math.cos(2 * math.pi * k / n), cv + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def cabo(p0, p1, r=0.045, cor="cinza_medio", nome="cabo"):
    return varre([p0, p1], sec_circ(r, 6), cor=cor, angulo=80, nome=nome)


def tubo_reto(p0, p1, r=0.03, cor="metal", n=8, nome="tubo"):
    return varre([p0, p1], sec_circ(r, n), cor=cor, angulo=80, nome=nome)


def caixa_rot(l, p, a, x, y, z, ang, cor, bisel=0.02, seg=1, nome="caixa"):
    ob = caixa(l, p, a, cor=cor, bisel=bisel, seg=seg, nome=nome)
    return mb.transforma(ob, loc=(x, y, z), rot=("Z", ang))


def sobe(objs, dz):
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        if o is not None:
            mb.transforma(o, loc=(0, 0, dz))
    return objs


def deforma(objs, f):
    """z += f(x, y) em todos os vértices (rampas)."""
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]):
        if o is None:
            continue
        for v in o.data.vertices:
            v.co.z += f(v.co.x, v.co.y)
        o.data.update()
    return objs


def laje_relevo(x0, x1, y0, y1, nx, ny, zf, cor, z_fundo=cb.Z_FUNDO, nome="laje_relevo"):
    """Laje com o topo em grade e altura zf(x, y) (rampas), laterais e fundo plano."""
    bm = bmesh.new()
    xs = [x0 + (x1 - x0) * i / nx for i in range(nx + 1)]
    ys = [y0 + (y1 - y0) * j / ny for j in range(ny + 1)]
    g = [[bm.verts.new((x, y, zf(x, y))) for x in xs] for y in ys]
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]))
    borda = [g[0][i] for i in range(nx + 1)] + [g[j][nx] for j in range(1, ny + 1)] + \
            [g[ny][i] for i in range(nx - 1, -1, -1)] + [g[j][0] for j in range(ny - 1, 0, -1)]
    baixo = [bm.verts.new((v.co.x, v.co.y, z_fundo)) for v in borda]
    k = len(borda)
    for i in range(k):
        bm.faces.new((borda[i], baixo[i], baixo[(i + 1) % k], borda[(i + 1) % k]))
    f = bm.faces.new(baixo[::-1])
    bmesh.ops.triangulate(bm, faces=[f])
    return mb._obj(nome, bm, cor, liso=False)


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def amostra(pts2d, passo):
    """Posições (x, y) e tangentes ao longo de uma polilinha, no meio de cada passo (passo ajustado ao comprimento)."""
    pts = [V((p[0], p[1])) for p in pts2d]
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + (b - a).length)
    L = s[-1]
    n = max(1, round(L / passo))
    p = L / n
    out = []
    j = 0
    for k in range(n):
        sk = (k + 0.5) * p
        while j < len(s) - 2 and s[j + 1] < sk:
            j += 1
        a, b = pts[j], pts[j + 1]
        t = (sk - s[j]) / max(1e-9, s[j + 1] - s[j])
        out.append((a + (b - a) * t, (b - a).normalized()))
    return out


def p3(pts2d, z=0.0):
    return [(p[0], p[1], z) for p in pts2d]


# ---------------------------------------------------------------------------------------------------------------------
# trilhos de trem
# ---------------------------------------------------------------------------------------------------------------------
SEC_TRILHO = [(-0.065, 0), (0.065, 0), (0.065, 0.02), (0.02, 0.045), (0.036, 0.10), (0.036, 0.14), (-0.036, 0.14),
              (-0.036, 0.10), (-0.02, 0.045), (-0.065, 0.02)]
SEC_BRITA = [(-2.05, -0.03), (2.05, -0.03), (1.97, 0.025), (1.58, 0.092), (1.48, Z_BRITA), (-1.48, Z_BRITA),
             (-1.58, 0.092), (-1.97, 0.025)]


def trilhos(pts2d, z=Z_DORM1, cor="trilho"):
    pts = p3(pts2d)
    return [varre(pts, [(u + s * X_TR, v + z) for u, v in SEC_TRILHO], cor=cor, angulo=50, nome="trilho")
            for s in (-1, 1)]


def brita(pts2d, z=0.0):
    return varre(p3(pts2d, z), SEC_BRITA, cor="brita", angulo=30, nome="brita")


def dormente(c, t, comp=2.5, z0=Z_DORM0, z1=Z_DORM1, cor="dormente", deslocar=0.0):
    ang = math.degrees(math.atan2(t.y, t.x)) - 90
    n = V((-t.y, t.x))
    p = c + n * deslocar
    return caixa_rot(comp, 0.24, z1 - z0, p.x, p.y, z0, ang, cor, bisel=0.025, seg=1, nome="dormente")


def dormentes(pts2d, passo=PASSO_DORM, filtro=None, **k):
    out = []
    for c, t in amostra(pts2d, passo):
        if filtro and not filtro(c, t):
            continue
        out.append(dormente(c, t, **k))
    return out


def via(it, pts2d, com_brita=True):
    """Via completa (brita, dormentes, trilhos) ao longo de uma linha 2D."""
    if com_brita:
        it.add(brita(pts2d))
    it.add(dormentes(pts2d))
    it.add(trilhos(pts2d))


def arbusto(x, y, r=0.6, cor="folha"):
    """Moita baixa de duas ou três bolas (decoração das quadras grandes de trilho)."""
    ps = [mb.superelipsoide(2 * r, 2 * r, 1.25 * r, x=x, y=y, z=-0.06, cor=cor, e=0.8, e_v=0.7, nu=12, nv=6),
          mb.superelipsoide(1.4 * r, 1.4 * r, 1.0 * r, x=x + 0.8 * r, y=y - 0.5 * r, z=-0.06, cor="folha_clara",
                            e=0.8, e_v=0.7, nu=10, nv=5)]
    return ps


def armario_sinal(x, y, ang=0):
    ps = [caixa(0.95, 0.55, 1.35, cor="cinza_azulado", bisel=0.05, seg=2),
          caixa(1.05, 0.65, 0.08, z=1.35, cor="grafite", bisel=0.03),
          caixa(1.1, 0.7, 0.12, z=-0.08, cor="concreto", bisel=0.03),
          caixa(0.02, 0.01, 1.1, x=0.0, y=-0.28, z=0.12, cor="grafite", bisel=0),
          caixa(0.06, 0.03, 0.14, x=0.09, y=-0.29, z=0.7, cor="amarelo", bisel=0.01)]
    o = mb.junta(ps, "armario")
    mb.transforma(o, rot=("Z", ang))
    mb.transforma(o, loc=(x, y, 0.0))
    return o


def grama(it, x0, y0, x1, y1, cor="grama"):
    it.add(cb.laje(cb.quadrado(x0, y0, x1, y1), 0.0, cor, nome="grama"))


def p_trilho_reto(it):
    grama(it, -H, -H, H, H)
    via(it, [(0, -H), (0, H)])
    # marcos de quilômetro discretos na beira (um só, para não repetir em fila)
    it.add(caixa(0.18, 0.18, 0.55, x=2.9, y=-4.0, z=0.0, cor="branco", bisel=0.04),
           caixa(0.19, 0.19, 0.12, x=2.9, y=-4.0, z=0.42, cor="amarelo", bisel=0.03))


def p_trilho_curva(it):
    """Curva de 90° em 2 × 2 quadras (30 × 30 m): entra pelo sul no meio da quadra sudoeste (x = −7,5) e sai pelo
    leste no meio da quadra nordeste (y = +7,5). Raio de 22,5 m."""
    grama(it, -Q, -Q, Q, Q)
    eixo = cb.arco(Q, -Q, 22.5, 180, 90, 40)
    via(it, eixo)
    it.add(arbusto(5.0, -5.0, 0.8), arbusto(8.5, -9.0, 0.55), arbusto(-11.5, 11.0, 0.7), arbusto(-8.0, 12.5, 0.5))
    it.add(armario_sinal(8.4, 10.6, -15))
    # postes de catenária baixos? não: placas de velocidade na parte de fora da curva
    for ang in (150, 120):
        p = V((Q + 25.3 * math.cos(math.radians(ang)), -Q + 25.3 * math.sin(math.radians(ang))))
        it.add(cilindro(0.05, 1.5, x=p.x, y=p.y, z=0, cor="metal", seg=10),
               cilindro(0.32, 0.06, x=p.x, y=p.y, z=1.55, cor="branco", eixo="y", seg=20),
               cilindro(0.26, 0.07, x=p.x, y=p.y - 0.005, z=1.55, cor="amarelo", eixo="y", seg=20))


def _desvio_eixos():
    reto = [(-H, -Q), (-H, Q)]
    R = 18.75
    phi = math.degrees(math.acos(0.6))
    a1 = cb.arco(-H + R, -Q, R, 180, 180 - phi, 20)
    a2 = cb.arco(H - R, Q, R, -phi, 0, 20)
    return reto, a1 + a2[1:]


def p_trilho_desvio(it):
    """Desvio em Y em 2 × 2 quadras: entra pelo sul da quadra sudoeste; o ramo reto segue para o norte (x = −7,5) e o
    desviado sai pelo norte da quadra nordeste (x = +7,5), em S com raio de 18,75 m."""
    grama(it, -Q, -Q, Q, Q)
    reto, desv = _desvio_eixos()
    # o leito do ramo desviado fica 1,5 cm abaixo: nada coplanar onde os dois se sobrepõem
    it.add(brita(reto), brita(desv, z=-0.015))
    # x do ramo desviado em função de y (monotônico)
    def x_desv(y):
        for a, b in zip(desv, desv[1:]):
            if a[1] <= y <= b[1]:
                t = (y - a[1]) / max(1e-9, b[1] - a[1])
                return a[0] + (b[0] - a[0]) * t
        return desv[-1][0]
    LIM = 3.0
    # dormentes: longos (comuns aos dois ramos) onde os eixos estão perto; depois cada ramo com os seus
    for c, t in amostra(reto, PASSO_DORM):
        d = x_desv(c.y) - (-H)
        if d < LIM:
            comp = 2.5 + d
            it.add(dormente(c, t, comp=comp, deslocar=-d / 2))
        else:
            it.add(dormente(c, t))
    it.add(dormentes(desv, filtro=lambda c, t: c.x - (-H) >= LIM, z0=Z_DORM0 - 0.006, z1=Z_DORM1 - 0.006))
    it.add(trilhos(reto), trilhos(desv, z=Z_DORM1 - 0.006))
    # agulhas: trilhos de encosto mais finos junto do ponto de partida (detalhe) e o aparelho de manobra com alavanca
    it.add(arbusto(2.5, 9.0, 0.7), arbusto(0.5, 12.0, 0.5), arbusto(10.5, -9.0, 0.8), arbusto(-12.5, 9.0, 0.6))
    it.add(armario_sinal(-H + 2.7, 2.5, 90))
    bx, by = -H - 2.45, -Q + 3.0
    it.add(caixa(0.7, 0.5, 0.45, x=bx, y=by, z=0.0, cor="cinza_azulado", bisel=0.05),
           caixa(0.8, 0.6, 0.06, x=bx, y=by, z=0.0, cor="concreto", bisel=0.02))
    alav = caixa(0.07, 0.07, 1.0, cor="amarelo", bisel=0.02)
    mb.transforma(alav, loc=(bx, by, 0.4), rot=("X", -25))
    it.add(alav, esfera(0.07, x=bx, y=by - 0.42, z=1.32, cor="preto", seg=12))
    it.add(cilindro(0.04, 1.3, x=bx - 0.25, y=by + 0.1, z=0.42, cor="metal", seg=10),
           cilindro(0.22, 0.05, x=bx - 0.25, y=by + 0.1, z=1.8, cor="branco", eixo="y", seg=20),
           cilindro(0.15, 0.06, x=bx - 0.25, y=by + 0.095, z=1.8, cor="vermelho", eixo="y", seg=20))


def p_trilho_fim(it):
    """Fim de linha: a via chega pelo sul e termina num para-choque de aço com dois amortecedores."""
    grama(it, -H, -H, H, H)
    yb = 3.2  # face dos amortecedores
    fim = 5.6
    # brita com a ponta arredondada
    L = fim + H
    def esc(t):
        y = -H + t * L
        if y < fim - 1.6:
            return (1, 1)
        u = (y - (fim - 1.6)) / 1.6
        return (max(0.05, math.cos(u * math.pi / 2) ** 0.6), 1)
    pts = [(0, -H, 0)] + [(0, fim - 1.6 + 1.6 * k / 8, 0) for k in range(9)]
    it.add(varre(pts, SEC_BRITA, cor="brita", escala=esc, angulo=30, nome="brita"))
    it.add(dormentes([(0, -H), (0, yb + 1.3)]))
    it.add(trilhos([(0, -H), (0, yb + 1.6)]))
    zt = Z_TR
    # para-choque: dois montantes, viga com faixas de alerta, amortecedores e escoras
    zv0, zv1 = zt + 0.45, zt + 0.95
    for s in (-1, 1):
        x = s * X_TR
        it.add(caixa(0.16, 0.16, zv0 - zt + 0.02, x=x, y=yb + 0.35, z=zt - 0.02, cor="ferro", bisel=0.03))
        esc_ = varre([(x, yb + 0.4, zv0 + 0.25), (x, yb + 1.5, zt - 0.02)], sec_ret(0.14, 0.14, 0.03), cor="ferro",
                     nome="escora")
        it.add(esc_)
        it.add(cilindro(0.11, 0.30, x=x, y=yb + 0.13, z=(zv0 + zv1) / 2, cor="metal", eixo="y", seg=16),
               cilindro(0.24, 0.07, x=x, y=yb - 0.035, z=(zv0 + zv1) / 2, cor="cromo", eixo="y", seg=24,
                           bisel=0.015))
    it.add(caixa(2.7, 0.30, zv1 - zv0, x=0, y=yb + 0.43, z=zv0, cor="vermelho", bisel=0.05))
    n = 9
    w = 2.5 / n
    for k in range(n):
        it.add(caixa(w + 0.002, 0.02, (zv1 - zv0) * 0.7, x=-1.25 + w * (k + 0.5), y=yb + 0.275,
                        z=zv0 + (zv1 - zv0) * 0.15, cor="amarelo" if k % 2 == 0 else "preto", bisel=0.0))
    # lanterna vermelha
    it.add(cilindro(0.05, 0.35, x=0, y=yb + 0.45, z=zv1, cor="ferro", seg=10),
           cilindro(0.14, 0.22, x=0, y=yb + 0.45, z=zv1 + 0.33, cor="preto", seg=16, bisel=0.02),
           cilindro(0.11, 0.06, x=0, y=yb + 0.33, z=zv1 + 0.44, cor="vermelho", eixo="y", seg=16))
    # base de concreto atrás e um poste com placa de fim de linha
    it.add(caixa(3.4, 1.3, 0.25, x=0, y=fim + 0.6, z=0.0, cor="concreto", bisel=0.04))
    it.add(cilindro(0.05, 1.6, x=2.6, y=yb + 0.6, z=0, cor="metal", seg=10),
           caixa(0.62, 0.05, 0.62, x=2.6, y=yb + 0.57, z=1.4, cor="branco", bisel=0.02),
           caixa(0.5, 0.05, 0.5, x=2.6, y=yb + 0.55, z=1.46, cor="vermelho", bisel=0.02),
           caixa(0.32, 0.05, 0.08, x=2.6, y=yb + 0.53, z=1.67, cor="branco", bisel=0.01))


# ---------------------------------------------------------------------------------------------------------------------
# cruzamento de trilho com rua (rua em Y no perfil cb.RUA; trilho em X)
# ---------------------------------------------------------------------------------------------------------------------
YP = 2.0     # meia largura do painel da passagem (em y)
XP = 5.9     # o painel vai até aqui em x; depois disso a via segue com brita até a borda
Z_PAINEL = Z_TR - 0.01
YR_ASF, YR_CALC = 5.5, 4.5


def z_asf(y):
    return -0.10 + (Z_PAINEL - 0.01 + 0.10) * smooth((YR_ASF - abs(y)) / (YR_ASF - YP))


def z_calc(y):
    return (Z_PAINEL - 0.01) * smooth((YR_CALC - abs(y)) / (YR_CALC - YP))


def cancela(it, s):
    """Cancela do lado direito de quem chega: s = +1 (quem sobe para o norte, poste a leste, ao sul do trilho) ou −1.
    A barra vermelha e branca levanta (porta no eixo y)."""
    px, py = s * 4.55, -s * 3.35
    z0 = z_calc(py)
    zp = z0 + 1.0
    base = [caixa(0.62, 0.62, 0.12, x=px, y=py, z=z0 - 0.04, cor="concreto", bisel=0.03),
            caixa(0.38, 0.42, 1.05, x=px, y=py, z=z0 + 0.06, cor="branco", bisel=0.06),
            caixa(0.40, 0.44, 0.18, x=px, y=py, z=z0 + 0.62, cor="vermelho", bisel=0.05),
            caixa(0.40, 0.44, 0.10, x=px, y=py, z=z0 + 1.08, cor="cinza_azulado", bisel=0.04)]
    it.add(base)
    # barra: de px até o eixo da rua (x = s·0,25), listrada; contrapeso atrás do pivô
    L = abs(px) - 0.25
    n = 7
    w = L / n
    barra = []
    for k in range(n):
        x = px - s * (0.3 + w * (k + 0.5))
        barra.append(caixa(w + 0.004, 0.09, 0.11, x=x, y=py - 0.28, z=zp - 0.055,
                              cor="vermelho" if k % 2 == 0 else "branco", bisel=0.02, seg=1))
    barra.append(caixa(0.5, 0.10, 0.14, x=px - s * 0.1, y=py - 0.28, z=zp - 0.07, cor="grafite", bisel=0.03))
    barra.append(caixa(0.34, 0.16, 0.26, x=px + s * 0.42, y=py - 0.28, z=zp - 0.13, cor="grafite", bisel=0.05))
    barra.append(cilindro(0.09, 0.12, x=px, y=py - 0.24, z=zp, cor="metal", eixo="y", seg=14))
    barra.append(esfera(0.06, x=px - s * (L + 0.3), y=py - 0.28, z=zp, cor="vermelho", seg=10))
    it.porta(barra, (px, py - 0.28, zp), eixo="y", angulo=s * 82, nome=f"cancela_{'norte' if s > 0 else 'sul'}")


def sinal(it, s):
    """Sinal luminoso: poste com a cruz de Santo André e duas lanternas vermelhas com viseira."""
    px, py = s * 6.25, -s * 2.55
    z0 = 0.0
    it.add(caixa(0.5, 0.5, 0.14, x=px, y=py, z=z0 - 0.04, cor="concreto", bisel=0.03),
           cilindro(0.08, 3.5, x=px, y=py, z=z0, cor="branco", seg=14),
           esfera(0.09, x=px, y=py, z=z0 + 3.5, cor="branco", seg=12))
    # a frente olha para quem chega (−s·y)
    fy = py - s * 0.11
    for ang, dy in ((40, 0.0), (-40, 0.03)):  # as duas tábuas da cruz não ficam no mesmo plano
        b = caixa(1.25, 0.04, 0.22, cor="vermelho", bisel=0.015)
        mb.transforma(b, rot=("Y", ang))
        mb.transforma(b, loc=(px, fy - s * dy, z0 + 2.9))
        w = caixa(1.13, 0.04, 0.12, cor="branco", bisel=0.01)
        mb.transforma(w, rot=("Y", ang))
        mb.transforma(w, loc=(px, fy - s * (dy + 0.012), z0 + 2.9))
        it.add(b, w)
    # placa traseira preta com duas lanternas
    it.add(caixa(1.0, 0.06, 0.42, x=px, y=fy, z=z0 + 2.05, cor="preto", bisel=0.05))
    for dx in (-0.3, 0.3):
        it.add(cilindro(0.13, 0.08, x=px + dx, y=fy - s * 0.06, z=z0 + 2.26, cor="vermelho_claro", eixo="y",
                           seg=18))
        visor = cilindro(0.16, 0.16, x=0, y=0, z=0, cor="preto", eixo="y", seg=18, tampas=False, bisel=0)
        # meia viseira (corta a metade de baixo)
        bmv = bmesh.new()
        bmv.from_mesh(visor.data)
        bmesh.ops.bisect_plane(bmv, geom=bmv.verts[:] + bmv.edges[:] + bmv.faces[:], plane_co=(0, 0, 0),
                               plane_no=(0, 0, 1), clear_inner=True)
        bmv.to_mesh(visor.data)
        bmv.free()
        mb.transforma(visor, loc=(px + dx, fy - s * 0.15, z0 + 2.26))
        it.add(visor)
    it.add(caixa(0.36, 0.05, 0.22, x=px, y=fy, z=z0 + 1.55, cor="amarelo", bisel=0.02))


def p_trilho_cruzamento_rua(it):
    """Passagem de nível: a rua (perfil cb.RUA) corre em Y e a ferrovia em X. A rua sobe em rampa suave até o painel
    da passagem, no nível do trilho; cancelas que levantam e sinais luminosos dos dois lados."""
    a, m = cb.RUA["asf"], cb.RUA["mf"]
    # asfalto em rampa
    it.add(laje_relevo(-m, m, -H, H, 1, 60, lambda x, y: z_asf(y), "asfalto", nome="asfalto"))
    # calçadas: perto da rua sobem junto (até x = ±XP); depois planas
    for s in (-1, 1):
        x0, x1 = sorted((s * m, s * XP))
        # a calçada sobe junto da rua e volta ao nível perto da via com brita (sem degrau lateral)
        it.add(laje_relevo(x0, x1, -H, H, 6, 40, lambda x, y: z_calc(y) * smooth((XP - abs(x)) / 1.1)
                           if abs(y) > YP + 0.01 else z_calc(y), "calcada"))
        x0, x1 = sorted((s * XP, s * H))
        it.add(cb.laje(cb.quadrado(x0, -H, x1, H), 0.0, "calcada"))
    # meios-fios até o painel, subindo com a calçada
    for sy in (-1, 1):
        for sx in (-1, 1):
            y0, y1 = sorted((sy * H, sy * YP))
            pts = [(sx * m, y0 + (y1 - y0) * k / 14) for k in range(15)]
            if sx < 0:  # o asfalto fica à esquerda de quem anda pela linha
                pts = pts[::-1]
            it.add(deforma(cb.meio_fio(pts), lambda x, y: z_calc(y)))
    # faixas: só no trecho plano/rampa, com a linha de retenção antes da rampa
    for sy in (-1, 1):
        y0, y1 = sorted((sy * 5.9, sy * H))
        it.add(deforma(cb.marcacoes_reta(cb.RUA, y0, y1), lambda x, y: z_asf(y) + 0.10))
        xa = (0, a - 0.3) if sy < 0 else (-(a - 0.3), 0)
        lr = caixa(xa[1] - xa[0], 0.4, cb.ALT_TINTA, x=sum(xa) / 2, y=sy * 6.1, z=cb.Z_ASF, cor="branco", bisel=0,
                      liso=False)
        it.add(lr)
        # aviso pintado "X" de passagem de nível na faixa de quem chega
        for ang, dz in ((35, 0.001), (-35, 0.003)):
            b = caixa(0.28, 1.5, cb.ALT_TINTA, cor="branco", bisel=0, liso=False)
            mb.transforma(b, rot=("Z", ang))
            mb.transforma(b, loc=(-sy * 1.83, sy * 6.65, cb.Z_ASF + dz))
            it.add(deforma(b, lambda x, y: z_asf(y) + 0.10))
    # painel da passagem: placas de concreto entre e fora dos trilhos, com o vão da roda (sulco) escuro
    zp = Z_PAINEL
    for yc, w in ((0.0, 2 * X_TR - 0.16), (X_TR + 0.08 + (YP - X_TR - 0.08) / 2, YP - X_TR - 0.08),
                  (-(X_TR + 0.08 + (YP - X_TR - 0.08) / 2), YP - X_TR - 0.08)):
        it.add(caixa(2 * XP, w - 0.02, zp + 0.1, x=0, y=yc, z=-0.1, cor="concreto_escuro", bisel=0.025, seg=1))
    for k in range(-2, 3):  # juntas das placas
        it.add(caixa(0.05, 2 * YP - 0.1, 0.004, x=k * 2.36, y=0, z=zp, cor="asfalto", bisel=0))
    for s in (-1, 1):
        it.add(caixa(2 * XP, 0.10, zp + 0.1 - 0.06, x=0, y=s * (X_TR - 0.03), z=-0.1, cor="preto", bisel=0))
    for s in (-1, 1):
        it.add(varre([(-H, 0, 0), (H, 0, 0)], [(u + s * X_TR, v + Z_DORM1) for u, v in SEC_TRILHO], cor="trilho",
                     angulo=50, nome="trilho"))
    # via com brita fora do painel
    for s in (-1, 1):
        x0, x1 = sorted((s * (XP - 0.05), s * H))
        it.add(brita([(x0, 0), (x1, 0)]))
        xd0, xd1 = sorted((s * (H - 2 * PASSO_DORM), s * H))
        it.add(dormentes([(xd0, 0), (xd1, 0)]))
    cancela(it, 1)
    cancela(it, -1)
    sinal(it, 1)
    sinal(it, -1)
    # colisão: a laje plana da quadra (caixa do cb.exporta, até z = 0) e, por cima, a lombada da passagem em malha:
    # rampas da rua e das calçadas até o painel, sem degraus
    it.colisao_malha(colisao_passagem(), "colisao_passagem")


def relevo_fechado(xs, ys, zf, z_fundo, cor="asfalto", nome="relevo"):
    """Sólido com o topo numa grade de estações dadas (xs, ys) e altura zf(x, y), laterais e fundo plano."""
    bm = bmesh.new()
    g = [[bm.verts.new((x, y, zf(x, y))) for x in xs] for y in ys]
    nx, ny = len(xs) - 1, len(ys) - 1
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]))
    borda = [g[0][i] for i in range(nx + 1)] + [g[j][nx] for j in range(1, ny + 1)] + \
            [g[ny][i] for i in range(nx - 1, -1, -1)] + [g[j][0] for j in range(ny - 1, 0, -1)]
    baixo = [bm.verts.new((v.co.x, v.co.y, z_fundo)) for v in borda]
    k = len(borda)
    for i in range(k):
        bm.faces.new((borda[i], baixo[i], baixo[(i + 1) % k], borda[(i + 1) % k]))
    f = bm.faces.new(baixo[::-1])
    bmesh.ops.triangulate(bm, faces=[f])
    return mb._obj(nome, bm, cor, liso=False)


def colisao_passagem():
    """Malha de colisão da passagem de nível: a rua (asfalto em z_asf) e as calçadas (z_calc, voltando ao nível
    perto da brita) entre x = ±XP, onde sobem acima da laje (|y| < 4,7); topo nunca abaixo de z = 0."""
    m = cb.RUA["mf"]
    xs = [-XP, -(XP - 1.1), -m, m, XP - 1.1, XP]
    ys = [-4.7, -4.3, -3.9, -3.5, -3.1, -2.7, -2.35, -YP, YP, 2.35, 2.7, 3.1, 3.5, 3.9, 4.3, 4.7]

    def zf(x, y):
        ax = abs(x)
        if abs(y) <= YP + 1e-6:
            z = Z_PAINEL
        elif ax <= m + 1e-6:
            z = z_asf(y)
        else:
            z = z_calc(y) * (1.0 if ax <= XP - 1.1 + 1e-6 else 0.0)
        return max(z, 0.0)

    return relevo_fechado(xs, ys, zf, -0.10, nome="colisao_passagem")


# ---------------------------------------------------------------------------------------------------------------------
# bonde
# ---------------------------------------------------------------------------------------------------------------------
def trilhos_bonde(it, y0=-H, y1=H, z=cb.Z_ASF, beira=None):
    for xc in (-X_BONDE, X_BONDE):
        for s in (-1, 1):
            x = xc + s * X_TR
            if beira:
                it.add(caixa(0.30, y1 - y0, 0.006, x=x, y=(y0 + y1) / 2, z=z - 0.004, cor=beira, bisel=0,
                                liso=False))
            it.add(caixa(0.075, y1 - y0, 0.03, x=x, y=(y0 + y1) / 2, z=z - 0.024, cor="trilho", bisel=0,
                            liso=False))
            it.add(caixa(0.035, y1 - y0, 0.004, x=x - s * 0.058, y=(y0 + y1) / 2, z=z + 0.0015, cor="preto",
                            bisel=0, liso=False))


def p_bonde_rua(it):
    cb.rua_reta(it)
    trilhos_bonde(it)


def p_bonde_grama(it):
    """Bonde sobre grama: o perfil cb.RUA com o leito de grama no lugar do asfalto (no mesmo nível), então continua a
    rua com bonde sem degrau. Os trilhos ficam sobre faixas de concreto."""
    m = cb.RUA["mf"]
    it.add(cb.laje(cb.quadrado(-m, -H, m, H), cb.Z_ASF, "grama", nome="leito"))
    it.add(cb.laje(cb.quadrado(-H, -H, -m, H), 0.0, "calcada"), cb.laje(cb.quadrado(m, -H, H, H), 0.0, "calcada"))
    it.add(cb.meio_fio([(-m, H), (-m, -H)]), cb.meio_fio([(m, -H), (m, H)]))
    trilhos_bonde(it, beira="concreto")
    # canteiro do meio com grama mais escura e tufos baixos
    it.add(caixa(0.7, 2 * H, 0.004, x=0, y=0, z=cb.Z_ASF, cor="grama_escura", bisel=0, liso=False))
    for y in (-5.0, 0.0, 5.0):
        it.add(mb.superelipsoide(0.55, 0.55, 0.32, x=0, y=y, z=cb.Z_ASF - 0.04, cor="folha", e=0.8, e_v=0.7, nu=12,
                                 nv=6))


def p_bonde_piso(it):
    """Bonde em piso rosado (rua compartilhada): o perfil cb.RUA com o leito em piso intertravado rosado no nível do
    asfalto, trilhos com faixas de concreto e juntas de paginação."""
    m = cb.RUA["mf"]
    it.add(cb.laje(cb.quadrado(-m, -H, m, H), cb.Z_ASF, "piso_rosado", nome="leito"))
    it.add(cb.laje(cb.quadrado(-H, -H, -m, H), 0.0, "calcada"), cb.laje(cb.quadrado(m, -H, H, H), 0.0, "calcada"))
    it.add(cb.meio_fio([(-m, H), (-m, -H)]), cb.meio_fio([(m, -H), (m, H)]))
    trilhos_bonde(it, beira="concreto_escuro")
    for k in range(6):  # juntas a cada 2,5 m (o desenho continua na quadra vizinha)
        y = -H + 1.25 + 2.5 * k
        for x0, x1 in ((-m + 0.05, -X_BONDE - X_TR - 0.16), (-X_BONDE + X_TR + 0.16, X_BONDE - X_TR - 0.16),
                       (X_BONDE + X_TR + 0.16, m - 0.05)):
            it.add(caixa(x1 - x0, 0.06, 0.003, x=(x0 + x1) / 2, y=y, z=cb.Z_ASF, cor="terracota_clara", bisel=0,
                         liso=False))
    for s in (-1, 1):  # frades (balizadores) na beira da calçada
        for y in (-5.0, 0.0, 5.0):
            it.add(cilindro(0.11, 0.75, x=s * (m + 0.45), y=y, z=0.0, cor="grafite", seg=10, bisel=0.03),
                   cilindro(0.115, 0.06, x=s * (m + 0.45), y=y, z=0.58, cor="amarelo", seg=10, bisel=0.01))


# ---------------------------------------------------------------------------------------------------------------------
# curvas de 2 × 2 quadras (a mesma geometria do trilho_curva): entram pelo sul no meio da quadra sudoeste (x = −7,5)
# e saem pelo leste no meio da quadra nordeste (y = +7,5); eixo em arco de raio 22,5 m com centro no canto (+15, −15).
# Um deslocamento lateral x (positivo para a direita de quem entra, como nas retas) vira o raio R_CURVA − x.
# ---------------------------------------------------------------------------------------------------------------------
R_CURVA = 22.5
C_CURVA = (Q, -Q)


def eixo_curva(n=40, desloc=0.0):
    """Linha paralela ao eixo da curva, deslocada 'desloc' para a direita (de quem entra pelo sul)."""
    return cb.arco(C_CURVA[0], C_CURVA[1], R_CURVA - desloc, 180, 90, n)


def pontas_exatas(e):
    """Linha da curva com um ponto a 1 cm de cada ponta, na tangente exata (norte na entrada, leste na saída): o
    cb.meio_fio e o cb.faixa tiram a direção da ponta da corda, e a ponta sairia ~1 mm da quadra."""
    return [e[0], (e[0][0], e[0][1] + 0.01)] + e[1:-1] + [(e[-1][0] - 0.01, e[-1][1]), e[-1]]


def faixa_curva(x0, x1, z, cor, n=40, nome="faixa"):
    """Laje (z até o fundo) entre os deslocamentos laterais x0 < x1 ao longo da curva."""
    return cb.laje(eixo_curva(n, x0) + eixo_curva(n, x1)[::-1], z, cor, nome=nome)


def fita_curva(x, larg, z0, z1, cor, n=40, mat="atlas", nome="fita"):
    """Perfil retangular (largura larg, de z0 a z1) varrido ao longo da curva no deslocamento x (trilhos embutidos,
    faixas de concreto, canteiro). Na varredura u aponta para a esquerda: u = −x."""
    return varre(p3(eixo_curva(n)), sec_ret(larg, z1 - z0, cu=-x, cv=(z0 + z1) / 2), cor=cor if mat == "atlas" else None,
                 mat=mat, liso=False, nome=nome)


def tracejado_curva(comprimento, traco=2.5):
    """Tracejado da linha central que cabe inteiro na curva: período ajustado a um número inteiro de traços, com as
    duas bordas no meio de um vão, como nas retas (traço centrado em y = 0, ±5 da quadra)."""
    per = comprimento / max(1, round(comprimento / (2 * traco)))
    return (per / 2, per / 2), per / 2


def rua_curva_2x2(it, leito="asfalto", lote="grama", faixas=True):
    """O perfil cb.RUA ao longo da curva: leito (asfalto, grama...) em z = −0,10 até os meios-fios, calçadas de
    3,75 m até a borda da quadra (|x| = 7,5) e, fora disso (no miolo da curva e no canto de fora), lote gramado."""
    a, m = cb.RUA["asf"], cb.RUA["mf"]
    n = 40
    it.add(faixa_curva(-m, m, cb.Z_ASF, leito, n, nome="leito"))
    it.add(faixa_curva(-H, -m, 0.0, "calcada", n, nome="calcada"), faixa_curva(m, H, 0.0, "calcada", n, nome="calcada"))
    miolo = [C_CURVA] + cb.arco(C_CURVA[0], C_CURVA[1], R_CURVA - H, 90, 180, 24)
    canto = eixo_curva(n, -H) + [(-Q, Q)]
    it.add(cb.laje(miolo, 0.0, lote, nome="lote"), cb.laje(canto, 0.0, lote, nome="lote"))
    it.add(cb.meio_fio(pontas_exatas(eixo_curva(2 * n, -m))), cb.meio_fio(pontas_exatas(eixo_curva(2 * n, m))))
    if faixas:
        L = R_CURVA * math.pi / 2
        tr, fase = tracejado_curva(L)
        it.add(cb.faixa(eixo_curva(n * 2), tracejada=tr, fase=fase))
        it.add(cb.faixa(pontas_exatas(eixo_curva(n * 2, -(a - 0.3))), larg=0.12),
               cb.faixa(pontas_exatas(eixo_curva(n * 2, a - 0.3)), larg=0.12))


def trilhos_bonde_curva(it, z=cb.Z_ASF, beira=None):
    """Os mesmos trilhos de bonde das retas (um par por faixa, centrado em x = ±1,825), embutidos, ao longo da curva:
    faixa de concreto opcional, boleto no nível do leito e o sulco escuro do lado de dentro de cada par."""
    for xc in (-X_BONDE, X_BONDE):
        for s in (-1, 1):
            x = xc + s * X_TR
            if beira:
                it.add(fita_curva(x, 0.30, z - 0.004, z + 0.002, beira, nome="beira"))
            it.add(fita_curva(x, 0.075, z - 0.024, z + 0.006, "trilho", nome="trilho"))
            it.add(fita_curva(x - s * 0.058, 0.035, z + 0.0015, z + 0.0055, "preto", nome="sulco"))


def arvore_lote(x, y, esc=1.0):
    """Árvore baixa dos lotes gramados das curvas (tronco e copa em duas bolas)."""
    return [cilindro(0.12 * esc, 1.4 * esc, x=x, y=y, z=0.0, cor="madeira", seg=8, r2=0.09 * esc, bisel=0.0),
            mb.superelipsoide(1.9 * esc, 1.9 * esc, 1.6 * esc, x=x, y=y, z=1.15 * esc, cor="folha", e=0.85, e_v=0.8,
                              nu=12, nv=6),
            mb.superelipsoide(1.2 * esc, 1.2 * esc, 1.0 * esc, x=x + 0.5 * esc, y=y - 0.3 * esc, z=1.0 * esc,
                              cor="folha_clara", e=0.85, e_v=0.8, nu=10, nv=5)]


def enfeites_lotes(it):
    """Lotes gramados da curva: miolo (perto do centro) e canto de fora, com árvores e moitas."""
    for x, y, e in ((9.5, -9.5, 1.15), (4.0, -12.0, 0.85), (12.0, -3.5, 0.9)):
        it.add(arvore_lote(x, y, e))
    for x, y, e in ((-12.0, 12.0, 1.05), (-13.2, 7.0, 0.8), (-7.5, 13.2, 0.85)):
        it.add(arvore_lote(x, y, e))
    it.add(arbusto(6.8, -6.0, 0.55), arbusto(-10.0, 9.6, 0.5))


def p_bonde_rua_curva(it):
    """Curva da rua com os trilhos de bonde acompanhando as faixas (2 × 2, raio de 22,5 m)."""
    rua_curva_2x2(it)
    trilhos_bonde_curva(it)
    enfeites_lotes(it)


def p_bonde_grama_curva(it):
    """Curva do bonde na grama: o leito gramado no nível do asfalto, faixas de concreto sob os trilhos, canteiro do
    meio em grama mais escura com tufos (2 × 2, raio de 22,5 m)."""
    rua_curva_2x2(it, leito="grama", faixas=False)
    trilhos_bonde_curva(it, beira="concreto")
    it.add(fita_curva(0.0, 0.7, cb.Z_ASF - 0.002, cb.Z_ASF + 0.002, "grama_escura", nome="canteiro"))
    for k in range(7):
        ang = math.radians(180 - 90 * (k + 0.5) / 7)
        x, y = C_CURVA[0] + R_CURVA * math.cos(ang), C_CURVA[1] + R_CURVA * math.sin(ang)
        it.add(mb.superelipsoide(0.55, 0.55, 0.32, x=x, y=y, z=cb.Z_ASF - 0.04, cor="folha", e=0.8, e_v=0.7, nu=12,
                                 nv=6))
    enfeites_lotes(it)


# ---------------------------------------------------------------------------------------------------------------------
# plataforma de estação
# ---------------------------------------------------------------------------------------------------------------------
X_PB, X_PF = 1.72, 5.6   # borda e fundo da plataforma


def banco(x, y, ang=90, cor="madeira_mel"):
    ps = []
    for k in range(3):
        ps.append(caixa(0.14, 1.6, 0.04, x=-0.16 + k * 0.16, y=0, z=0.44, cor=cor, bisel=0.015))
    for k in range(2):
        ps.append(caixa(0.04, 1.6, 0.12, x=0.27, y=0, z=0.58 + k * 0.16, cor=cor, bisel=0.015))
    for s in (-0.65, 0.65):
        ps.append(caixa(0.5, 0.06, 0.06, x=0.0, y=s, z=0.40, cor="ferro", bisel=0.02))
        ps.append(caixa(0.06, 0.06, 0.44, x=-0.18, y=s, z=0.0, cor="ferro", bisel=0.02))
        ps.append(caixa(0.06, 0.06, 0.88, x=0.26, y=s, z=0.0, cor="ferro", bisel=0.02))
    o = mb.junta(ps, "banco")
    mb.transforma(o, rot=("Z", ang - 90))
    mb.transforma(o, loc=(x, y, Z_PLAT))
    return o


def p_plataforma_estacao(it):
    grama(it, -H, -H, H, H)
    via(it, [(0, -H), (0, H)])
    zt = Z_PLAT
    # corpo, laje com pingadeira e piso
    it.add(caixa(X_PF - X_PB - 0.1, 2 * H, zt - 0.12, x=(X_PB + 0.1 + X_PF) / 2, y=0, z=0, cor="concreto",
                    bisel=0.04, seg=2))
    it.add(caixa(X_PF - X_PB, 2 * H, 0.14, x=(X_PB + X_PF) / 2, y=0, z=zt - 0.14, cor="calcada", bisel=0.03,
                    seg=2))
    it.add(caixa(0.12, 2 * H, 0.004, x=X_PB + 0.07, y=0, z=zt, cor="branco", bisel=0, liso=False))
    # faixa tátil de alerta (amarela, com relevo de bolinhas)
    xt = X_PB + 0.42
    it.add(caixa(0.40, 2 * H, 0.006, x=xt, y=0, z=zt, cor="amarelo", bisel=0, liso=False))
    for j in range(60):
        y = -H + 0.125 + j * 0.25
        for dx in (-0.1, 0.1):
            it.add(caixa(0.06, 0.06, 0.012, x=xt + dx, y=y + (0.06 if dx > 0 else -0.06) * 0, z=zt + 0.004,
                            cor="amarelo_escuro", bisel=0.0))
    # escada de acesso pelos fundos (x de X_PF até a borda) e guarda-corpo
    n = 7
    passo = (H - X_PF - 0.05) / n
    alt = zt / (n + 1)
    for k in range(n):
        it.add(caixa(passo + 0.002, 4.0, alt * (n - k), x=X_PF + passo * (k + 0.5), y=0, z=0,
                        cor="concreto" if k % 2 else "calcada", bisel=0.02, seg=1))
    for s in (-1, 1):
        y = s * 2.05
        it.add(caixa(H - X_PF - 0.05, 0.12, 0.12, x=(X_PF + H - 0.05) / 2, y=y, z=0, cor="concreto", bisel=0.03))
        it.add(tubo_reto((X_PF - 0.1, y, zt + 1.0), (H - 0.15, y, alt + 1.0), 0.035, "metal"))
        it.add(cilindro(0.03, 1.0, x=X_PF + 0.05, y=y, z=zt, cor="metal", seg=10),
               cilindro(0.03, 1.0, x=H - 0.2, y=y, z=alt, cor="metal", seg=10))
    for s in (-1, 1):  # guarda-corpo no fundo da plataforma
        y0, y1 = sorted((s * 2.05, s * H))
        x = X_PF - 0.1
        it.add(tubo_reto((x, y0, zt + 1.1), (x, y1, zt + 1.1), 0.035, "metal"),
               tubo_reto((x, y0, zt + 0.55), (x, y1, zt + 0.55), 0.02, "metal"))
        for k in range(4):
            y = y0 + (y1 - y0) * (k + 0.5) / 4
            it.add(cilindro(0.03, 1.1, x=x, y=y, z=zt, cor="metal", seg=10))
    # cobertura: pilares a cada 5 m e telhado em asa, com a calha no meio
    xc = 4.35
    zc = zt + 3.4
    for y in (-5.0, 0.0, 5.0):
        it.add(cilindro(0.13, zc - zt, x=xc, y=y, z=zt, cor="branco", seg=16),
               cilindro(0.2, 0.08, x=xc, y=y, z=zt, cor="cinza_claro", seg=16))
        brac = varre([(xc + 0.95, y, zc + 0.08), (xc, y, zc - 0.25), (2.35, y, zc + 0.22)], sec_ret(0.18, 0.16, 0.04),
                     cor="branco", n0=(0, 1, 0), nome="mao_francesa")
        it.add(brac)
    sec_tel = [(-1.62, 0.32), (0.55, -0.06), (1.70, 0.18), (1.70, 0.30), (0.55, 0.06), (-1.62, 0.44)]
    tel = varre([(xc - 0.55, -H, zc), (xc - 0.55, H, zc)], [(-u, v) for u, v in sec_tel], cor="turquesa_escuro",
                nome="telhado", angulo=30)
    it.add(tel)
    it.add(varre([(xc - 0.55 + 1.70, -H, zc + 0.24), (xc - 0.55 + 1.70, H, zc + 0.24)], sec_ret(0.12, 0.2, 0.03),
                 cor="branco", nome="testeira"),
           varre([(xc - 0.55 - 1.62, -H, zc + 0.38), (xc - 0.55 - 1.62, H, zc + 0.38)], sec_ret(0.12, 0.2, 0.03),
                 cor="branco", nome="testeira"))
    it.add(caixa(0.12, 2 * H, 0.04, x=xc - 0.55, y=0, z=zc - 0.05, cor=None, mat="luz", bisel=0.0))
    # placa da estação pendurada e relógio
    for y in (-2.5, 2.5):
        it.add(cilindro(0.015, 0.55, x=xc - 1.0, y=y - 0.9, z=zc - 0.5, cor="metal", seg=6),
               cilindro(0.015, 0.55, x=xc - 1.0, y=y + 0.9, z=zc - 0.5, cor="metal", seg=6))
        it.add(caixa(0.08, 2.1, 0.48, x=xc - 1.0, y=y, z=zc - 1.0, cor="azul_marinho", bisel=0.03),
               caixa(0.09, 1.7, 0.12, x=xc - 1.0, y=y, z=zc - 0.82, cor="branco", bisel=0.01))
    # bancos, lixeira e mapa
    it.add(banco(4.9, -2.5), banco(4.9, 2.5))
    it.add(cilindro(0.22, 0.75, x=4.95, y=0.75, z=zt, cor="verde_medio", seg=16),
           cilindro(0.24, 0.05, x=4.95, y=0.75, z=zt + 0.75, cor="grafite", seg=16))
    it.add(caixa(0.1, 1.1, 1.6, x=X_PF - 0.2, y=-6.3, z=zt, cor="cinza_azulado", bisel=0.03),
           caixa(0.12, 0.95, 0.75, x=X_PF - 0.21, y=-6.3, z=zt + 0.7, cor="papel", bisel=0.01),
           caixa(0.13, 0.9, 0.08, x=X_PF - 0.22, y=-6.3, z=zt + 1.25, cor="vermelho", bisel=0.01))
    it.colisao([((0, 0, -0.4), (Q, Q, 0.4)), ((X_PB + (X_PF - X_PB) / 2, 0, 0), (X_PF - X_PB, Q, zt)),
                ((X_PF + (H - X_PF) * 0.25, 0, 0), ((H - X_PF) / 2, 4.0, zt * 0.75)),
                ((X_PF + (H - X_PF) * 0.75, 0, 0), ((H - X_PF) / 2, 4.0, zt * 0.3))])


# ---------------------------------------------------------------------------------------------------------------------
# trem de alta velocidade: tabuleiro elevado, tubo de vidro, pilar em garfo, pilar avulso
# ---------------------------------------------------------------------------------------------------------------------
XT_D = 2.8         # meia largura do tabuleiro do trem
ZT_B = Z_EL - 0.95  # fundo do tabuleiro
COR_PILAR = "piso_rosado"


def tabuleiro_trem(it, y0=-H, y1=H, guarda=False):
    z = Z_EL
    sec = [(-XT_D, z + 0.5), (-XT_D, z - 0.35), (-XT_D + 0.25, z - 0.62), (-1.6, ZT_B + 0.05), (-1.3, ZT_B),
           (1.3, ZT_B), (1.6, ZT_B + 0.05), (XT_D - 0.25, z - 0.62), (XT_D, z - 0.35), (XT_D, z + 0.5),
           (XT_D - 0.32, z + 0.5), (XT_D - 0.32, z), (-XT_D + 0.32, z), (-XT_D + 0.32, z + 0.5)]
    it.add(varre([(0, y0, 0), (0, y1, 0)], [(-u, v) for u, v in sec], cor="concreto", nome="tabuleiro", angulo=35))
    # piso entre as muretas um pouco mais escuro
    it.add(caixa(2 * XT_D - 0.66, y1 - y0, 0.004, x=0, y=(y0 + y1) / 2, z=z, cor="concreto_escuro", bisel=0,
                    liso=False))
    # via em laje: dormentes de concreto e trilhos
    zd0, zd1 = z, z + 0.12
    for c, t in amostra([(0, y0), (0, y1)], 0.6):
        it.add(caixa(2.3, 0.2, zd1 - zd0, x=c.x, y=c.y, z=zd0 - 0.002, cor="concreto", bisel=0.02, seg=1))
    for s in (-1, 1):
        it.add(varre([(0, y0, 0), (0, y1, 0)], [(u + s * X_TR, v + zd1) for u, v in SEC_TRILHO], cor="trilho",
                     angulo=50, nome="trilho"))
    # frisos de luz no topo das muretas
    for s in (-1, 1):
        it.add(caixa(0.06, y1 - y0, 0.03, x=s * (XT_D - 0.16), y=(y0 + y1) / 2, z=z + 0.5, cor=None, mat="neon",
                        bisel=0))
    if guarda:
        for s in (-1, 1):
            x = s * (XT_D - 0.16)
            it.add(tubo_reto((x, y0, z + 1.15), (x, y1, z + 1.15), 0.035, "metal"))
            for k in range(6):
                y = y0 + (y1 - y0) * (k + 0.5) / 6
                it.add(cilindro(0.03, 0.66, x=x, y=y, z=z + 0.5, cor="metal", seg=8))


def tubo_vidro(it, y0=-H, y1=H, aneis=(-5.0, 5.0)):
    zc = Z_EL + 0.5
    r = 2.66
    n = 36
    a0, a1 = -2.0, 182.0
    sec = [((r + 0.03) * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
            (r + 0.03) * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
    sec += [((r - 0.03) * math.cos(math.radians(a1 - (a1 - a0) * k / n)),
             (r - 0.03) * math.sin(math.radians(a1 - (a1 - a0) * k / n))) for k in range(n + 1)]
    it.add(varre([(0, y0, zc), (0, y1, zc)], [(-u, v) for u, v in sec], cor=None, mat="vidro", nome="tubo",
                 angulo=20))
    # linha de luz no alto do tubo
    it.add(varre([(0, y0, zc), (0, y1, zc)], sec_ret(0.16, 0.05, cv=r + 0.05), cor=None, mat="neon",
                 nome="luz_tubo"))
    # anéis estruturais
    for y in aneis:
        m = 24
        s1 = [((r + 0.03) * math.cos(math.radians(a0 + (a1 - a0) * k / m)),
               (r + 0.03) * math.sin(math.radians(a0 + (a1 - a0) * k / m))) for k in range(m + 1)]
        s2 = [((r + 0.20) * math.cos(math.radians(a1 - (a1 - a0) * k / m)),
               (r + 0.20) * math.sin(math.radians(a1 - (a1 - a0) * k / m))) for k in range(m + 1)]
        it.add(varre([(0, y - 0.16, zc), (0, y + 0.16, zc)], s1 + s2, cor="grafite", nome="anel", angulo=30))


def garfo(it, y=0.0):
    """Pilar em forma de garfo: tronco do chão até 4,5 m; os dois dentes sobem abraçando o tubo e se fecham em arco
    por cima. Uma travessa sob o tabuleiro."""
    zc = Z_EL + 0.5
    R = 3.55
    lado = [(1.0, 4.4), (2.7, 5.5), (3.45, 6.6), (R, zc)]
    arco_ = [(R * math.cos(math.radians(a)), zc + R * math.sin(math.radians(a))) for a in range(15, 166, 15)]
    pts = [(x, y, z) for x, z in lado] + [(x, y, z) for x, z in arco_] + [(-x, y, z) for x, z in lado[::-1]]
    pts = mb._arredonda_cantos(pts, 1.4, 3)
    it.add(varre(pts, sec_ret(1.8, 0.9, 0.3), cor=COR_PILAR, n0=(0, 1, 0), nome="garfo", angulo=40))
    it.add(caixa(6.6, 1.5, 0.75, x=0, y=y, z=ZT_B - 0.72, cor=COR_PILAR, bisel=0.2, seg=2))
    tronco = varre([(0, y, -0.3), (0, y, 2.6), (0, y, 4.9)], sec_ret(1.8, 2.2, 0.45), cor=COR_PILAR, n0=(0, 1, 0),
                   escala=lambda t: (1.0, 0.85 + 0.3 * t * t), nome="tronco")
    it.add(tronco)
    it.add(caixa(3.2, 2.6, 0.5, x=0, y=y, z=-0.4, cor="concreto_escuro", bisel=0.1))
    # friso de luz na face do garfo
    for sy in (-1, 1):
        it.add(varre([(x, y + sy * 0.92, z) for x, _, z in pts[3:-3]], sec_ret(0.04, 0.14), cor=None,
                     mat="neon", n0=(0, 1, 0), nome="friso"))


def pilar_coluna(it, x=0.0, y=0.0, topo=ZT_B, larg=(1.7, 1.3)):
    l, p = larg
    it.add(caixa(l + 1.0, p + 1.0, 0.5, x=x, y=y, z=-0.4, cor="concreto_escuro", bisel=0.1))
    it.add(varre([(x, y, 0.0), (x, y, 0.75)], sec_ret(l + 0.5, p + 0.5, 0.3), cor=COR_PILAR, n0=(0, 1, 0),
                 escala=lambda t: (1 - 0.12 * t, 1 - 0.12 * t), nome="base"))
    h0, h1 = 0.7, topo - 0.9
    it.add(varre([(x, y, h0), (x, y, h1)], sec_ret(l, p, 0.28), cor=COR_PILAR, n0=(0, 1, 0), nome="fuste"))
    it.add(varre([(x, y, h1 - 0.05), (x, y, h1 + 0.5), (x, y, topo - 0.1)], sec_ret(l, p, 0.3), cor=COR_PILAR,
                 n0=(0, 1, 0), escala=lambda t: (1 + 0.55 * t ** 1.5, 1 + 0.45 * t ** 1.5), nome="capitel"))
    for s in (-1, 1):
        it.add(caixa(0.5, 0.5, 0.12, x=x + s * 0.55, y=y, z=topo - 0.115, cor="grafite", bisel=0.03))
    for sy in (-1, 1):  # friso
        it.add(caixa(0.12, 0.03, h1 - h0 - 0.6, x=x, y=y + sy * (p / 2 + 0.005), z=h0 + 0.3, cor=None, mat="neon",
                        bisel=0))


def p_trem_tubo_reto(it):
    tabuleiro_trem(it)
    tubo_vidro(it)
    garfo(it)
    it.colisao([((0, 0, ZT_B), (2 * XT_D, Q, Z_EL - ZT_B)),
                ((0, 0, -0.4), (2.8, 1.8, ZT_B + 0.4)),
                ((3.5, 0, 4.4), (1.0, 1.8, 5.0)), ((-3.5, 0, 4.4), (1.0, 1.8, 5.0)),
                ((0, 0, Z_EL + 3.0), (7.2, 1.8, 1.5))])


def p_trem_tabuleiro_aberto(it):
    tabuleiro_trem(it, guarda=True)
    pilar_coluna(it)
    it.colisao([((0, 0, ZT_B), (2 * XT_D, Q, Z_EL - ZT_B)), ((0, 0, -0.4), (2.4, 2.0, ZT_B + 0.4))])


def p_trem_pilar(it):
    pilar_coluna(it)
    it.colisao([((0, 0, -0.4), (2.7, 2.3, ZT_B + 0.4))])


def tabuleiro_trem_cam(it, pts2d, guarda=False):
    """tabuleiro_trem ao longo de uma linha 2D qualquer (as curvas): a mesma seção, dormentes de concreto a cada
    0,6 m pelo eixo, trilhos e frisos de luz no topo das muretas."""
    z = Z_EL
    sec = [(-XT_D, z + 0.5), (-XT_D, z - 0.35), (-XT_D + 0.25, z - 0.62), (-1.6, ZT_B + 0.05), (-1.3, ZT_B),
           (1.3, ZT_B), (1.6, ZT_B + 0.05), (XT_D - 0.25, z - 0.62), (XT_D, z - 0.35), (XT_D, z + 0.5),
           (XT_D - 0.32, z + 0.5), (XT_D - 0.32, z), (-XT_D + 0.32, z), (-XT_D + 0.32, z + 0.5)]
    cam = p3(pts2d)
    it.add(varre(cam, [(-u, v) for u, v in sec], cor="concreto", nome="tabuleiro", angulo=35))
    it.add(varre(cam, sec_ret(2 * XT_D - 0.66, 0.004, cv=z + 0.002), cor="concreto_escuro", liso=False, nome="piso"))
    zd0, zd1 = z, z + 0.12
    for c, t in amostra(pts2d, 0.6):
        ang = math.degrees(math.atan2(t.y, t.x)) - 90
        it.add(caixa_rot(2.3, 0.2, zd1 - zd0, c.x, c.y, zd0 - 0.002, ang, "concreto", bisel=0.02, seg=1))
    for s in (-1, 1):
        it.add(varre(cam, [(u + s * X_TR, v + zd1) for u, v in SEC_TRILHO], cor="trilho", angulo=50, nome="trilho"))
        it.add(varre(cam, sec_ret(0.06, 0.03, cu=s * (XT_D - 0.16), cv=z + 0.515), cor=None, mat="neon", liso=False,
                     nome="friso"))


def tubo_vidro_cam(it, pts2d, aneis_s=()):
    """tubo_vidro ao longo de uma linha 2D: meia-cana de vidro, linha de luz no alto e anéis nas distâncias aneis_s
    (metros pelo eixo), cada anel perpendicular ao eixo naquele ponto."""
    zc = Z_EL + 0.5
    r = 2.66
    n = 36
    a0, a1 = -2.0, 182.0
    sec = [((r + 0.03) * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
            (r + 0.03) * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
    sec += [((r - 0.03) * math.cos(math.radians(a1 - (a1 - a0) * k / n)),
             (r - 0.03) * math.sin(math.radians(a1 - (a1 - a0) * k / n))) for k in range(n + 1)]
    cam = p3(pts2d, zc)
    it.add(varre(cam, [(-u, v) for u, v in sec], cor=None, mat="vidro", nome="tubo", angulo=20))
    it.add(varre(cam, sec_ret(0.16, 0.05, cv=r + 0.05), cor=None, mat="neon", nome="luz_tubo"))
    m = 24
    s1 = [((r + 0.03) * math.cos(math.radians(a0 + (a1 - a0) * k / m)),
           (r + 0.03) * math.sin(math.radians(a0 + (a1 - a0) * k / m))) for k in range(m + 1)]
    s2 = [((r + 0.20) * math.cos(math.radians(a1 - (a1 - a0) * k / m)),
           (r + 0.20) * math.sin(math.radians(a1 - (a1 - a0) * k / m))) for k in range(m + 1)]
    for p, t in ponto_no_eixo(pts2d, aneis_s):
        q = V((p.x, p.y, zc))
        tt = V((t.x, t.y, 0))
        it.add(varre([q - tt * 0.16, q + tt * 0.16], s1 + s2, cor="grafite", nome="anel", angulo=30))


def ponto_no_eixo(pts2d, distancias):
    """(posição, tangente) nas distâncias dadas (metros) ao longo de uma polilinha 2D."""
    pts = [V((p[0], p[1])) for p in pts2d]
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + (b - a).length)
    out = []
    for d in distancias:
        j = max(0, min(len(s) - 2, next((k for k in range(len(s) - 1) if s[k + 1] >= d), len(s) - 2)))
        u = (d - s[j]) / max(1e-9, s[j + 1] - s[j])
        out.append((pts[j].lerp(pts[j + 1], u), (pts[j + 1] - pts[j]).normalized()))
    return out


def garfo_em(it, p, t):
    """O pilar em garfo do trecho reto, girado para ficar perpendicular ao eixo no ponto p (tangente t)."""
    tmp = mb.Item("tmp")
    garfo(tmp, 0.0)
    ang = math.degrees(math.atan2(t.y, t.x)) - 90
    for o in tmp.partes:
        mb.transforma(o, loc=(p.x, p.y, 0.0), rot=("Z", ang))
    it.add(tmp.partes)
    return ang


def caixa_orientada(c, t, l, p, z0, z1):
    """Caixa sem boleado de l (através do eixo) × p (ao longo) × (z1 − z0), centrada em c e alinhada à tangente t."""
    ob = mb.caixa(l, p, z1 - z0, z=z0, cor="concreto", bisel=0.0, liso=False)
    return mb.transforma(ob, loc=(c.x, c.y, 0.0), rot=("Z", math.degrees(math.atan2(t.y, t.x)) - 90))


def p_trem_tubo_curva(it):
    """Curva do trem em tubo de vidro (2 × 2, raio de 22,5 m como o trilho_curva): tabuleiro, tubo e dois pilares em
    garfo; elevado na altura das retas (trilho sobre o tabuleiro em z = 7,5)."""
    eixo = eixo_curva(32)
    L = R_CURVA * math.pi / 2
    tabuleiro_trem_cam(it, eixo)
    tubo_vidro_cam(it, eixo, aneis_s=(3.3, L / 2, L - 3.3))
    pilares = ponto_no_eixo(eixo, (L / 4, 3 * L / 4))
    for p, t in pilares:
        garfo_em(it, p, t)
    # colisão: o tabuleiro curvo (com as muretas) e os braços e o arco dos garfos em malha; os troncos em caixas
    sec = [(-XT_D, Z_EL + 0.5), (-XT_D + 0.32, Z_EL + 0.5), (-XT_D + 0.32, Z_EL), (XT_D - 0.32, Z_EL),
           (XT_D - 0.32, Z_EL + 0.5), (XT_D, Z_EL + 0.5), (XT_D, ZT_B), (-XT_D, ZT_B)]
    partes = [varre(p3(eixo_curva(16)), [(-u, v) for u, v in sec], cor="concreto", liso=False, nome="col")]
    for p, t in pilares:
        n = V((t.y, -t.x))  # para a direita do eixo
        for sx in (-1, 1):
            partes.append(caixa_orientada(p + n * (sx * 3.5), t, 1.0, 1.8, 4.4, 9.4))
        partes.append(caixa_orientada(p, t, 7.2, 1.8, Z_EL + 3.0, Z_EL + 4.5))
    it.colisao_malha(mb.junta(partes, "colisao_tubo"), "colisao_tubo")
    it.colisao([((p.x, p.y, -0.4), (2.6, 2.6, ZT_B + 0.4)) for p, _ in pilares])


# ---------------------------------------------------------------------------------------------------------------------
# tabuleiro rodoviário elevado (base das pontes)
# ---------------------------------------------------------------------------------------------------------------------
def tabuleiro_rua(it, y0, y1, perfil=cb.RUA, z=Z_EL, guarda=True, vaos=(), neon=False):
    a, m = perfil["asf"], perfil["mf"]
    zf = z - 0.45
    it.add(cb.laje(cb.quadrado(-m, y0, m, y1), z - 0.10, "asfalto", z_fundo=zf, nome="asfalto"))
    it.add(cb.laje(cb.quadrado(-H, y0, -m, y1), z, "calcada", z_fundo=zf),
           cb.laje(cb.quadrado(m, y0, H, y1), z, "calcada", z_fundo=zf))
    it.add(sobe([cb.meio_fio([(-m, y1), (-m, y0)]), cb.meio_fio([(m, y0), (m, y1)])], z))
    it.add(sobe(cb.marcacoes_reta(perfil, y0, y1), z))
    # estrutura: laje com abas e viga-caixão trapezoidal
    zz = z
    sec = [(7.47, zz - 0.44), (7.47, zz - 0.82), (7.22, zz - 0.92), (5.3, zz - 1.0), (4.6, zz - 1.12),
           (4.0, zz - 1.30), (-4.0, zz - 1.30), (-4.6, zz - 1.12), (-5.3, zz - 1.0), (-7.22, zz - 0.92),
           (-7.47, zz - 0.82), (-7.47, zz - 0.44)]
    it.add(varre([(0, y0, 0), (0, y1, 0)], [(-u, v) for u, v in sec], cor="concreto", nome="viga", angulo=30))
    for s in (-1, 1):  # friso da aba (branco, ou neon nas pontes futuristas)
        it.add(caixa(0.025, y1 - y0, 0.14, x=s * 7.485, y=(y0 + y1) / 2, z=zz - 0.66,
                        cor=None if neon else "branco", mat="neon" if neon else "atlas", bisel=0))
    if guarda:
        guarda_corpo(it, y0, y1, z, vaos)


def _intervalos(y0, y1, vaos):
    segs = [(y0, y1)]
    for a, b in vaos:
        novo = []
        for c, d in segs:
            if b <= c or a >= d:
                novo.append((c, d))
                continue
            if a > c:
                novo.append((c, a))
            if b < d:
                novo.append((b, d))
        segs = novo
    return [s for s in segs if s[1] - s[0] > 0.3]


def guarda_corpo(it, y0, y1, z, vaos=()):
    """Guarda-corpo de 1,10 m na borda da calçada elevada: mureta de concreto, montantes a cada 2,5 m e dois tubos."""
    for s in (-1, 1):
        x = s * 7.32
        for a, b in _intervalos(y0, y1, vaos):
            it.add(caixa(0.32, b - a, 0.42, x=s * 7.33, y=(a + b) / 2, z=z - 0.02, cor="concreto", bisel=0.05, seg=2))
            it.add(tubo_reto((x, a, z + 1.10), (x, b, z + 1.10), 0.045, "metal"),
                   tubo_reto((x, a, z + 0.78), (x, b, z + 0.78), 0.025, "metal"))
            k0 = math.ceil((a - y0 - 1.25) / 2.5 - 1e-6)
            k1 = math.floor((b - y0 - 1.25) / 2.5 + 1e-6)
            for k in range(k0, k1 + 1):
                y = y0 + 1.25 + 2.5 * k
                if a + 0.1 < y < b - 0.1:
                    it.add(caixa(0.06, 0.06, 0.72, x=x, y=y, z=z + 0.38, cor="metal", bisel=0.015))


def pilar_ponte(it, y, z=Z_EL, largura=8.0):
    """Pilar em martelo: fuste arredondado e travessa sob a viga."""
    zt = z - 1.30
    it.add(caixa(4.2, 3.4, 0.5, x=0, y=y, z=-0.4, cor="concreto_escuro", bisel=0.1))
    # numa linha vertical com n0 = Y: u corre em Y e v em X
    it.add(varre([(0, y, 0.0), (0, y, zt - 1.0)], sec_ret(1.7, 2.6, 0.6), cor="concreto", n0=(0, 1, 0),
                 nome="fuste"))
    it.add(varre([(0, y, zt - 1.1), (0, y, zt - 0.6), (0, y, zt)], sec_ret(1.7, 2.6, 0.4), cor="concreto",
                 n0=(0, 1, 0), escala=lambda t: (1.0, 1 + (largura / 2.6 - 1) * smooth(t) ** 0.6), nome="travessa"))


def col_tabuleiro(L, extras=()):
    return [((0, 0, Z_EL - 1.30), (Q, L, 1.30))] + list(extras)


def p_ponte_tabuleiro(it, perfil=cb.RUA):
    tabuleiro_rua(it, -H, H, perfil)
    pilar_ponte(it, 0.0)
    it.colisao(col_tabuleiro(Q, [((0, 0, -0.4), (2.6, 1.7, Z_EL - 1.3 + 0.4))]))
    return it


# ---------------------------------------------------------------------------------------------------------------------
# pontes grandes
# ---------------------------------------------------------------------------------------------------------------------
def p_ponte_estaiada_agulha(it):
    """Ponte estaiada de pilone único (75 m): pilone em agulha com o 'olho' em volta do tabuleiro, pé único no chão,
    estais em leque nos dois sentidos e frisos de neon ciano nas faces."""
    L = 75.0
    yA = 0.0
    tabuleiro_rua(it, -L / 2, L / 2, vaos=[(yA - 1.3, yA + 1.3)], neon=True)
    zb = Z_EL - 1.30
    zt = Z_EL + 40.0
    # pernas: pé -> joelho (sob o tabuleiro) -> ombro -> ápice; mastro do ápice ao topo
    for s in (-1, 1):
        perna = [(s * 0.7, yA, 0.6), (s * 6.85, yA, zb - 0.5), (s * 6.85, yA, Z_EL + 3.0), (s * 1.0, yA, Z_EL + 17.0),
                 (0.0, yA, Z_EL + 20.5)]
        perna = mb._arredonda_cantos(perna, 3.0, 8)
        it.add(varre(perna, sec_ret(1.7, 1.15, 0.3), cor="porcelana", n0=(0, 1, 0), nome="perna", angulo=35))
        for sy in (-1, 1):
            it.add(varre(perna[1:-2], sec_ret(0.04, 0.2, cu=sy * 0.86), cor=None, mat="neon", n0=(0, 1, 0),
                         nome="neon"))
    mastro = [(0.0, yA, Z_EL + 17.5), (0.0, yA, zt)]
    it.add(varre(mastro, sec_ret(2.2, 1.6, 0.4), cor="porcelana", n0=(0, 1, 0),
                 escala=lambda t: (1 - 0.35 * t, 1 - 0.3 * t), nome="mastro"))
    it.add(varre([(0.0, yA, zt - 0.02), (0.0, yA, zt + 1.2)], sec_ret(1.43, 1.12, 0.3), cor="porcelana",
                 n0=(0, 1, 0), escala=lambda t: (1 - 0.6 * t, 1 - 0.6 * t), nome="ponta"))
    for sy in (-1, 1):
        it.add(varre([(0.0, yA + sy * 0.0, Z_EL + 19.0), (0.0, yA, zt - 0.5)],
                     sec_ret(0.045, 0.22, cu=sy * 1.08), cor=None, mat="neon", n0=(0, 1, 0),
                     escala=lambda t: (1 - 0.32 * t, 1), nome="neon"))
    # travessa sob o tabuleiro e sapata
    it.add(caixa(14.2, 1.6, 0.9, x=0, y=yA, z=zb - 0.9, cor="porcelana", bisel=0.3, seg=2))
    it.add(caixa(4.0, 4.0, 1.1, x=0, y=yA, z=-0.4, cor="concreto_escuro", bisel=0.2))
    # estais: do mastro para as duas bordas, nos dois sentidos
    n = 10
    for sy in (-1, 1):
        for k in range(n):
            ya = yA + sy * (5.0 + k * 3.2)
            za = Z_EL + 23.0 + k * 1.55
            for sx in (-1, 1):
                it.add(cabo((0.0, yA + sy * 0.55, za), (sx * 6.55, ya, Z_EL + 0.15)))
                it.add(caixa(0.22, 0.3, 0.16, x=sx * 6.55, y=ya, z=Z_EL - 0.01, cor="grafite", bisel=0.03))
    it.colisao(col_tabuleiro(L) + [((0, yA, -0.4), (4.0, 4.0, 1.1)),
                                   ((3.6, yA, 0.7), (4.6, 1.8, zb - 0.7)), ((-3.6, yA, 0.7), (4.6, 1.8, zb - 0.7)),
                                   ((6.85, yA, zb), (1.3, 1.8, Z_EL + 5.0 - zb)),
                                   ((-6.85, yA, zb), (1.3, 1.8, Z_EL + 5.0 - zb)),
                                   ((0, yA, Z_EL + 5.0), (11.0, 1.8, 13.0)), ((0, yA, Z_EL + 18.0), (2.4, 1.8, 23.0))])


def p_ponte_estaiada_v(it):
    """Ponte de pilones em V (90 m): dois apoios; em cada um, nas duas bordas, um V de braços curvos (um longo,
    inclinado para o vão central, e um curto) com estais em harpa e neon nos braços."""
    L = 90.0
    est = (-22.5, 22.5)
    tabuleiro_rua(it, -L / 2, L / 2, vaos=[(y - 1.4, y + 1.4) for y in est], neon=True)
    zb = Z_EL - 1.30
    col = []
    for yS in est:
        sg = 1 if yS < 0 else -1   # o braço longo aponta para o meio da ponte
        # pilar-parede sob o tabuleiro e a travessa que leva os braços
        it.add(caixa(5.6, 4.0, 0.9, x=0, y=yS, z=-0.4, cor="concreto_escuro", bisel=0.2))
        it.add(varre([(0, yS, 0.0), (0, yS, zb - 4.0), (0, yS, zb - 1.4)], sec_ret(2.4, 9.0, 1.1),
                     cor="porcelana_azul", n0=(0, 1, 0), escala=lambda t: (1.0, 0.5 + 0.5 * smooth(t) ** 2),
                     nome="pilar"))
        it.add(caixa(14.9, 2.8, 1.5, x=0, y=yS, z=zb - 1.45, cor="porcelana_azul", bisel=0.45, seg=3))
        for sx in (-1, 1):
            x = sx * 6.8
            longo = [(x, yS, zb - 0.6)] + [(x, yS + sg * (14.0 * u ** 1.35), zb + 1.0 + 31.0 * u) for u in
                                            [k / 10 for k in range(1, 11)]]
            curto = [(x, yS, zb - 0.6)] + [(x, yS - sg * (6.0 * u ** 1.25), zb + 1.0 + 22.0 * u) for u in
                                            [k / 8 for k in range(1, 9)]]
            for br, alt in ((longo, 31.0), (curto, 22.0)):
                it.add(varre(br, sec_ret(1.25, 1.6, 0.35), cor="porcelana", n0=(1, 0, 0), nome="braco", angulo=35,
                             escala=lambda t: (1 - 0.35 * t, 1 - 0.45 * t)))
                it.add(varre(br[1:], sec_ret(0.045, 0.24, cu=sx * 0.64), cor=None, mat="neon",
                             n0=(1, 0, 0), escala=lambda t: (1 - 0.35 * t, 1 - 0.45 * t), nome="neon"))
                it.add(esfera(0.55, x=br[-1][0], y=br[-1][1], z=br[-1][2], cor="porcelana", seg=14,
                                 esc=(1.1 * 0.62, 1.0 * 0.62, 0.9)))
            # estais em harpa do braço longo e do curto
            for br, nk, passo in ((longo, 9, 2.1), (curto, 6, 1.9)):
                d = sg if br is longo else -sg
                for k in range(nk):
                    i = 3 + k * (len(br) - 4) / max(1, nk - 1)
                    i0 = int(i)
                    t = i - i0
                    p0 = V(br[min(i0, len(br) - 1)]).lerp(V(br[min(i0 + 1, len(br) - 1)]), t)
                    ya = p0.y + d * (2.0 + 0.25 * (p0.z - Z_EL))
                    it.add(cabo((x - sx * 0.1, p0.y, p0.z), (sx * 6.55, ya, Z_EL + 0.15), r=0.04))
                    it.add(caixa(0.2, 0.28, 0.14, x=sx * 6.55, y=ya, z=Z_EL - 0.01, cor="grafite", bisel=0.03))
        col += [((0, yS, -0.4), (9.0, 2.6, zb + 0.4)),
                ((6.85, yS + sg * 4.5, zb), (1.6, 11.0, 18.0)), ((-6.85, yS + sg * 4.5, zb), (1.6, 11.0, 18.0))]
    it.colisao(col_tabuleiro(L) + col)


def _laco(n=170):
    A, Zc, B = 33.0, Z_EL + 11.7, 12.0
    pts = []
    for k in range(n):
        th = 2 * math.pi * k / n
        c = math.cos(th)
        x = 6.2 * math.tanh(2.0 * c) / math.tanh(2.0)
        y = A * math.sin(th)
        z = Zc + B * math.sin(2 * th)
        pts.append((x, y, z))
    return pts


def p_ponte_laco(it):
    """Ponte futurista em laço (75 m): uma fita torcida em laço (um oito em 3D) que pousa no tabuleiro em dois pés,
    em cantos opostos, com neon nas duas bordas e estais finos segurando o tabuleiro."""
    L = 75.0
    pts = _laco()
    # pés: onde a fita desce mais
    zs = [p[2] for p in pts]
    zmin = min(zs)
    dz = (Z_EL - 0.2) - zmin
    pts = [(x, y, z + dz) for x, y, z in pts]
    pes = sorted(range(len(pts)), key=lambda i: pts[i][2])[:1]
    i1 = pes[0]
    i2 = min(range(len(pts)), key=lambda i: (pts[i][2] if (pts[i][1] * pts[i1][1] < 0) else 1e9))
    pes = [pts[i1], pts[i2]]
    tabuleiro_rua(it, -L / 2, L / 2, vaos=[(p[1] - 2.0, p[1] + 2.0) for p in pes], neon=True)
    sec = sec_ret(2.4, 0.62, 0.28, seg=3)
    tor = None
    it.add(varre(pts, sec, cor="branco", n0=(1, 0, 0), fechado=True, voltas=1, torcao=tor, nome="fita", angulo=40))
    for su in (-1, 1):
        it.add(varre(pts, sec_ret(0.1, 0.36, cu=su * 1.2), cor=None, mat="neon", n0=(1, 0, 0), fechado=True,
                     voltas=1, torcao=tor, nome="neon_fita"))
    # sob a fita, um forro azul-claro (o lado de baixo da fita no desenho de referência)
    zb = Z_EL - 1.30
    col = []
    for p in pes:
        x, y, z = p
        it.add(mb.superelipsoide(2.8, 4.2, 1.3, x=x, y=y, z=Z_EL - 0.2, cor="porcelana_azul", e=0.45, e_v=0.6))
        # pilar sob o tabuleiro
        it.add(caixa(4.6, 3.8, 0.7, x=0, y=y, z=-0.4, cor="concreto_escuro", bisel=0.15))
        it.add(varre([(0, y, 0.0), (0, y, zb - 0.6)], sec_ret(2.0, 3.2, 0.7), cor="porcelana_azul", n0=(0, 1, 0),
                     nome="pilar"))
        it.add(varre([(0, y, zb - 1.4), (0, y, zb - 0.7), (0, y, zb)], sec_ret(2.0, 3.2, 0.5), cor="porcelana_azul",
                     n0=(0, 1, 0), escala=lambda t: (1.0, 1 + 2.7 * smooth(t) ** 0.6), nome="travessa"))
        col.append(((0, y, -0.4), (3.2, 2.0, zb + 0.4)))
    # estais: dos trechos altos da fita para as bordas do tabuleiro
    n = len(pts)
    for i in range(0, n, 5):
        x, y, z = pts[i]
        if z < Z_EL + 7.5 or abs(y) > L / 2 - 2:
            continue
        alvos = (-1, 1) if abs(x) < 3.5 else ((1,) if x > 0 else (-1,))
        for sx in alvos:
            it.add(cabo((x, y, z - 0.3), (sx * 6.55, y * 0.96, Z_EL + 0.15), r=0.035))
            it.add(caixa(0.2, 0.26, 0.14, x=sx * 6.55, y=y * 0.96, z=Z_EL - 0.01, cor="grafite", bisel=0.03))
    zmax = max(p[2] for p in pts)
    col += [((pes[0][0], pes[0][1], Z_EL), (3.0, 5.0, 4.0)), ((pes[1][0], pes[1][1], Z_EL), (3.0, 5.0, 4.0)),
            ((0, 0, zmax - 6.0), (14.0, 2 * 33.0, 6.5))]
    it.colisao(col_tabuleiro(L) + col)


def p_ponte_passarela(it):
    """Passarela de pedestres sobre a rua (perfil cb.RUA em Y): atravessa em X com cobertura de vidro, escadas
    paralelas à rua nas duas calçadas."""
    cb.rua_reta(it)
    zt = 5.6
    yd0, yd1 = 1.9, 4.5
    xe0, xe1 = 4.55, 6.15
    cor_e = "azul_celeste"
    # tabuleiro
    it.add(caixa(2 * xe1, yd1 - yd0, 0.12, x=0, y=(yd0 + yd1) / 2, z=zt - 0.12, cor="calcada", bisel=0.03))
    for y in (yd0 + 0.14, yd1 - 0.14):
        it.add(caixa(2 * xe1, 0.28, 0.62, x=0, y=y, z=zt - 0.62, cor=cor_e, bisel=0.06, seg=2))
    it.add(caixa(2 * xe1 - 0.1, yd1 - yd0 - 0.4, 0.2, x=0, y=(yd0 + yd1) / 2, z=zt - 0.42, cor="branco",
                    bisel=0.03))
    # guarda-corpos do tabuleiro (deixa a abertura para a escada em cada ponta)
    for y in (yd0 + 0.1, yd1 - 0.1):
        abre = (y < (yd0 + yd1) / 2)
        xs = [(-xe0 if abre else -xe1, xe0 if abre else xe1)]
        for a, b in xs:
            it.add(tubo_reto((a, y, zt + 1.1), (b, y, zt + 1.1), 0.04, "branco"),
                   tubo_reto((a, y, zt + 0.5), (b, y, zt + 0.5), 0.025, "branco"))
            nn = int((b - a) / 1.0)
            for k in range(nn + 1):
                it.add(cilindro(0.03, 1.1, x=a + (b - a) * k / nn, y=y, z=zt, cor="branco", seg=8))
            it.add(caixa(b - a, 0.02, 0.5, x=(a + b) / 2, y=y, z=zt + 0.55, cor=None, mat="vidro", bisel=0))
    # cobertura em arco de vidro sobre arcos brancos
    for k in range(7):
        x = -xe1 + 0.05 + (2 * xe1 - 0.1) * k / 6
        arco_ = [(x, (yd0 + yd1) / 2 + 1.25 * math.cos(math.radians(a)), zt + 2.2 + 0.55 * math.sin(math.radians(a)))
                 for a in range(0, 181, 15)]
        arco_ = [(x, yd1 - 0.06, zt)] + arco_ + [(x, yd0 + 0.06, zt)]
        it.add(varre(arco_, sec_ret(0.1, 0.1), cor="branco", n0=(1, 0, 0), nome="arco", angulo=60))
    sec_c = [(1.25 * math.cos(math.radians(a)), 0.55 * math.sin(math.radians(a))) for a in range(0, 181, 15)]
    sec_c = sec_c + [(u * 0.97, v * 0.9) for u, v in sec_c[::-1]]
    it.add(varre([(-xe1, (yd0 + yd1) / 2, zt + 2.2), (xe1, (yd0 + yd1) / 2, zt + 2.2)], sec_c, cor=None, mat="vidro",
                 nome="cobertura"))
    # escadas: sobem para +y nas duas calçadas
    n = 32
    ye0 = -6.75
    passo = (yd0 - ye0) / n
    alt = zt / n
    col = [((0, 0, -0.4), (Q, Q, 0.4)), ((0, (yd0 + yd1) / 2, zt - 0.62), (2 * xe1, yd1 - yd0, 0.62))]
    for s in (-1, 1):
        xa, xb = sorted((s * xe0, s * xe1))
        xm = (xa + xb) / 2
        for k in range(n):
            it.add(caixa(xb - xa - 0.2, passo + 0.004, 0.06, x=xm, y=ye0 + passo * (k + 0.5), z=alt * (k + 1) - 0.06,
                         cor="calcada", bisel=0.0))
        for xx in (xa + 0.08, xb - 0.08):
            longarina = [(xx, ye0 - 0.2, -0.05), (xx, yd0 + 0.02, zt - 0.1)]
            it.add(varre(longarina, sec_ret(0.16, 0.42, 0.05), cor=cor_e, n0=(1, 0, 0), nome="longarina"))
            it.add(tubo_reto((xx, ye0 - 0.1, 1.0), (xx, yd0, zt + 1.0), 0.035, "branco"))
            for k in range(1, 8):
                y = ye0 + (yd0 - ye0) * k / 8
                z = zt * (y - ye0) / (yd0 - ye0)
                it.add(cilindro(0.025, 1.0, x=xx, y=y, z=z, cor="branco", seg=8))
        # pilares: no patamar e no meio da escada
        for y, z in ((3.2, zt - 0.62), (-2.3, alt * (math.floor((-2.3 - ye0) / passo) + 1) - 0.06)):
            it.add(cilindro(0.2, z, x=xm, y=y, z=0, cor=cor_e, seg=16),
                   cilindro(0.32, 0.12, x=xm, y=y, z=0, cor="concreto", seg=16))
        for j in range(3):
            y0 = ye0 + (yd0 - ye0) * j / 3
            y1 = ye0 + (yd0 - ye0) * (j + 1) / 3
            col.append(((xm, (y0 + y1) / 2, 0), (xb - xa, y1 - y0, zt * (j + 0.5) / 3)))
    it.colisao(col)


def p_ponte_arco_tijolo(it):
    """Ponte pequena de arco abatido (terracota e tijolo) para rua de 2 faixas: a rua fica no nível normal e o arco
    passa por baixo, sobre um canal que corre em X."""
    cb.rua_reta(it)
    zf = -3.6
    za = -1.15   # fecho do arco (intradorso)
    ya = 6.2     # nascença
    R = (ya ** 2 + (za - zf) ** 2) / (2 * (za - zf))
    zc = za - R
    a0 = math.degrees(math.asin(ya / R))
    arco_ = [(R * math.sin(math.radians(-a0 + 2 * a0 * k / 24)), zc + R * math.cos(math.radians(-a0 + 2 * a0 * k / 24)))
             for k in range(25)]
    perfil = [(-H, zf), (-ya, zf)] + arco_ + [(ya, zf), (H, zf), (H, -0.38), (-H, -0.38)]
    it.add(mb.extrudado(mb._ccw(perfil), 2 * H - 0.5, x=-H + 0.25, cor="terracota", bisel=0.0, plano="yz",
                        nome="alvenaria", liso=False))
    # faces: aduelas em tijolo, fecho claro, cornija e pilastras nas nascenças
    for sx in (-1, 1):
        x0 = sx * (H - 0.25)
        aduela = []
        for k in range(24):
            if k == 12:
                continue
            aa = -a0 + 2 * a0 * (k + 0.5) / 24
            p = V((R * math.sin(math.radians(aa)), zc + R * math.cos(math.radians(aa))))
            d = V((math.sin(math.radians(aa)), math.cos(math.radians(aa))))
            b = caixa(0.16, 2 * R * math.sin(math.radians(a0 / 24)) - 0.05, 0.62, cor="tijolo" if k % 2 else
                         "terracota_escura", bisel=0.03, seg=1)
            mb.transforma(b, rot=("X", -aa))
            mb.transforma(b, loc=(x0 + sx * 0.08, p.x + d.x * 0.0, p.y))
            aduela.append(b)
        it.add(aduela)
        fecho = caixa(0.2, 0.62, 0.9, x=x0 + sx * 0.1, y=0, z=za - 0.02, cor="terracota_clara", bisel=0.04)
        it.add(fecho)
        it.add(caixa(0.22, 2 * H, 0.32, x=x0 + sx * 0.1, y=0, z=-0.62, cor="terracota_escura", bisel=0.05, seg=2))
        for sy in (-1, 1):
            it.add(caixa(0.2, 0.9, -zf - 0.62, x=x0 + sx * 0.1, y=sy * (H - 0.45), z=zf, cor="tijolo", bisel=0.05))
    # parapeito de tijolo com capa sobre a beira da calçada
    for sx in (-1, 1):
        x = sx * (H - 0.22)
        it.add(caixa(0.34, 2 * H - 1.0, 0.62, x=x, y=0, z=-0.01, cor="tijolo", bisel=0.05, seg=2),
               caixa(0.4, 2 * H - 1.0, 0.1, x=x, y=0, z=0.6, cor="terracota_clara", bisel=0.04, seg=2))
        for y in (-H + 0.3, H - 0.3):
            it.add(caixa(0.5, 0.5, 0.85, x=sx * (H - 0.28), y=y, z=-0.01, cor="terracota", bisel=0.05),
                   caixa(0.56, 0.56, 0.1, x=sx * (H - 0.28), y=y, z=0.84, cor="terracota_clara", bisel=0.04))
    it.colisao([((0, 0, -0.62), (Q, Q, 0.62)), ((0, -(H + ya) / 2, zf), (Q, H - ya + 0.6, -zf - 0.6)),
                ((0, (H + ya) / 2, zf), (Q, H - ya + 0.6, -zf - 0.6)), ((0, 0, za - 0.1), (Q, 2 * ya, -0.5 - za))])


# ---------------------------------------------------------------------------------------------------------------------
# catálogo
# ---------------------------------------------------------------------------------------------------------------------
TOPO = cb.DIR_TOPO
ALTO = (0.55, -1.0, 0.5)
PONTE = (1.0, -0.55, 0.42)

PECAS = {
    "ferrovia": [
        ("trilho_reto", p_trilho_reto, "Trilho reto", "trilho_reto", ["trilho", "modular"], TOPO, None),
        ("trilho_curva", p_trilho_curva, "Curva de trilho (2 × 2)", "trilho_curva", ["trilho", "modular", "curva"],
         TOPO, [((0, 0, -0.4), (2 * Q, 2 * Q, 0.4))]),
        ("trilho_desvio", p_trilho_desvio, "Desvio em Y (2 × 2)", "trilho_desvio", ["trilho", "modular", "desvio"],
         TOPO, [((0, 0, -0.4), (2 * Q, 2 * Q, 0.4))]),
        ("trilho_fim", p_trilho_fim, "Fim de linha com para-choque", "trilho_fim", ["trilho", "modular"], TOPO,
         [((0, 0, -0.4), (Q, Q, 0.4)), ((0, 3.6, 0), (2.8, 1.0, 1.3))]),
        ("trilho_cruzamento_rua", p_trilho_cruzamento_rua, "Passagem de nível com cancelas", "trilho_cruzamento",
         ["trilho", "rua", "modular", "cancela"], TOPO, None),
        ("bonde_rua", p_bonde_rua, "Rua com trilhos de bonde", "bonde_rua", ["bonde", "rua", "trilho", "modular"],
         TOPO, None),
        ("bonde_grama", p_bonde_grama, "Trilhos de bonde na grama", "bonde_grama", ["bonde", "trilho", "modular"],
         TOPO, None),
        ("bonde_piso", p_bonde_piso, "Trilhos de bonde em piso rosado", "bonde_piso",
         ["bonde", "trilho", "rua", "modular"], TOPO, None),
        ("bonde_rua_curva", p_bonde_rua_curva, "Curva da rua com trilhos de bonde (2 × 2)", "bonde_rua_curva",
         ["bonde", "rua", "trilho", "modular", "curva", "2x2"], TOPO, [((0, 0, -0.4), (2 * Q, 2 * Q, 0.4))]),
        ("bonde_grama_curva", p_bonde_grama_curva, "Curva de bonde na grama (2 × 2)", "bonde_grama_curva",
         ["bonde", "trilho", "modular", "curva", "2x2"], TOPO, [((0, 0, -0.4), (2 * Q, 2 * Q, 0.4))]),
        ("plataforma_estacao", p_plataforma_estacao, "Plataforma de estação", "plataforma",
         ["trilho", "estacao", "modular"], ALTO, None),
        ("trem_tubo_reto", p_trem_tubo_reto, "Trem em tubo: trecho reto com pilar", "trem_tubo",
         ["trilho", "elevado", "tubo", "modular"], ALTO, None),
        ("trem_tubo_curva", p_trem_tubo_curva, "Trem em tubo: curva com pilares (2 × 2)", "trem_tubo_curva",
         ["trilho", "elevado", "tubo", "modular", "curva", "2x2"], ALTO, None),
        ("trem_tabuleiro_aberto", p_trem_tabuleiro_aberto, "Trem: tabuleiro elevado aberto", "trem_tabuleiro",
         ["trilho", "elevado", "modular"], ALTO, None),
        ("trem_pilar", p_trem_pilar, "Trem: pilar avulso", "trem_pilar", ["trilho", "elevado", "pilar"], ALTO, None),
    ],
    "pontes": [
        ("ponte_arco_tijolo", p_ponte_arco_tijolo, "Ponte pequena de arco (tijolo)", "ponte_arco",
         ["ponte", "rua", "modular", "agua"], ALTO, None),
        ("ponte_passarela", p_ponte_passarela, "Passarela sobre a rua", "passarela", ["ponte", "rua", "pedestre"],
         ALTO, None),
        ("ponte_tabuleiro_rua", p_ponte_tabuleiro, "Tabuleiro de ponte (rua)", "ponte_tabuleiro",
         ["ponte", "rua", "elevado", "modular"], ALTO, None),
        ("ponte_tabuleiro_avenida", lambda it: p_ponte_tabuleiro(it, cb.AVENIDA), "Tabuleiro de ponte (avenida)",
         "ponte_tabuleiro", ["ponte", "avenida", "elevado", "modular"], ALTO, None),

        ("ponte_estaiada_agulha", p_ponte_estaiada_agulha, "Ponte estaiada de pilone em agulha", "ponte_estaiada",
         ["ponte", "rua", "elevado", "neon"], PONTE, None),
        ("ponte_estaiada_v", p_ponte_estaiada_v, "Ponte de pilones em V", "ponte_v",
         ["ponte", "rua", "elevado", "neon"], PONTE, None),
        ("ponte_laco", p_ponte_laco, "Ponte futurista em laço", "ponte_laco", ["ponte", "rua", "elevado", "neon"],
         PONTE, None),
    ],
}


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    saida = a[0]
    pedidos = a[1:]
    for cat_nome, lista in PECAS.items():
        sel = [p for p in lista if not pedidos or cat_nome in pedidos or p[0] in pedidos]
        if not sel:
            continue
        cat = mb.Catalogo(cat_nome, saida, rotulo={"ferrovia": "Ferrovia", "pontes": "Pontes"}[cat_nome])
        for id_, f, rot, grupo, tags, dmini, col in sel:
            mb.limpa()
            it = mb.Item(id_)
            f(it)
            if col is not None and it.colisores is None:
                it.colisao(col)
            if os.environ.get("TRIS_DEBUG"):
                cont = {}
                for o in it.partes + [o for o, _ in it.interativos]:
                    nm = o.name.split(".")[0]
                    cont[nm] = cont.get(nm, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
                print("tris", id_, sorted(cont.items(), key=lambda kv: -kv[1])[:10], flush=True)
            cb.exporta(cat, it, rot, grupo, tags=tags, dir_mini=dmini, extra={"z_elevado": Z_EL}
                       if "elevado" in tags else None)
        ordem = [p[0] for p in lista]  # catálogo sempre na ordem do gerador (a vitrine segue essa ordem)
        cat.dados["itens"].sort(key=lambda e: ordem.index(e["id"]) if e["id"] in ordem else len(ordem))
        cat.salva()


if __name__ == "__main__":
    main()
