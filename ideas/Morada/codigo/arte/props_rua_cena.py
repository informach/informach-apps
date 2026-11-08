"""Teste de cena dos props de rua: uma esquina com um quarteirão de 2 × 2 quadras (três prédios regulares e uma
pracinha de comércio), rua em T, calçadas cheias de props junto com o mobiliário urbano, e embaixo o calçadão com
ciclovia, ladrilho e balaustrada de frente para o mar. As peças de telhado vão nas lajes livres dos prédios e as de
fachada nas paredes: as posições saem de raios lançados contra os GLB dos prédios (o telhado é o nível mais comum dos
toques de cima; a parede é o plano mais comum dos toques de lado; as janelas são os toques em vidro "janela*").

Uso: MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/props_rua_cena.py -- SP/cidade_out [dia|noite]
     [longe|esquina|telhados|calcadao]
Grava SP/cidade_out/props_rua/teste_cena[_<vista>]_<dia|noite>.png.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_vegetacao_mobiliario_vitrines  # noqa: E402,F401  (estampas fracas de dia e fortes à noite)

V = Vector
Q, H = 15.0, 7.5
SAIDA = ""
PR, MOB, VEG, REG = "props_rua", "mobiliario_urbano", "vegetacao", "predios_regulares"
RAIZES = []
LOG = []


def importa(cat, id_, x, y, giro=0.0, z=0.0):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SAIDA, cat, "glb", id_ + ".glb"))
    novos = [o for o in bpy.data.objects if o not in antes]
    raiz = [o for o in novos if o.parent is None][0]
    raiz.location = (x, y, z)
    raiz.rotation_mode = "XYZ"
    raiz.rotation_euler = (raiz.rotation_euler.x, raiz.rotation_euler.y, math.radians(giro))
    for o in novos:
        if o.get("colisao"):
            o.hide_render = True
            o.hide_set(True)
    RAIZES.append((cat, id_, raiz, novos))
    return raiz


def T(i, j):
    return (Q * i, Q * j)


def raio(origem, direcao, ignora=()):
    dg = bpy.context.evaluated_depsgraph_get()
    o = V(origem)
    for _ in range(6):
        ok, loc, nor, idx, ob, _m = bpy.context.scene.ray_cast(dg, o, V(direcao).normalized())
        if not ok:
            return None
        if ob in ignora or ob.get("colisao"):
            o = loc + V(direcao).normalized() * 0.01
            continue
        mat = ""
        try:
            mi = ob.data.polygons[idx].material_index
            mat = ob.data.materials[mi].name.split(".")[0]
        except (IndexError, AttributeError):
            pass
        return loc, nor, ob, mat
    return None


# ---------------------------------------------------------------------------------------------------------------- telhado
def mapa_telhado(cx, cy, meio=6.8, passo=0.25):
    """Grade de toques de cima sobre a projeção do prédio: {(i, j): z} só nas faces viradas para cima."""
    g = {}
    n = int(2 * meio / passo)
    for i in range(n + 1):
        for j in range(n + 1):
            x, y = cx - meio + passo * i, cy - meio + passo * j
            r = raio((x, y, 200), (0, 0, -1))
            if r and r[1].z > 0.95 and r[0].z > 2.0:
                g[i, j] = round(r[0].z, 2)
    zs = {}
    for z in g.values():
        zs[z] = zs.get(z, 0) + 1
    z_laje = max(zs, key=lambda z: zs[z]) if zs else None
    return g, z_laje, (cx - meio, cy - meio, passo)


def poe_no_telhado(cat, id_, cx, cy, mapa, meia, giro=0.0, ocupado=None, preferir=(0, 0), folga=0.25):
    """Acha um quadrado livre (meia-largura meia + folga) na laje e põe a peça lá; devolve a posição ou None."""
    g, z, (x0, y0, p) = mapa
    if z is None:
        return None
    k = int(math.ceil((meia + folga) / p))
    melhores = []
    for (i, j), zz in g.items():
        if abs(zz - z) > 0.03 or (i, j) in ocupado:
            continue
        ok = True
        for a in range(-k, k + 1):
            for b in range(-k, k + 1):
                q = (i + a, j + b)
                if q not in g or abs(g[q] - z) > 0.03 or q in ocupado:
                    ok = False
                    break
            if not ok:
                break
        if ok:
            x, y = x0 + p * i, y0 + p * j
            melhores.append(((x - (cx + preferir[0])) ** 2 + (y - (cy + preferir[1])) ** 2, i, j, x, y))
    if not melhores:
        LOG.append(f"sem lugar no telhado para {id_}")
        return None
    _, i, j, x, y = min(melhores)
    for a in range(-k, k + 1):
        for b in range(-k, k + 1):
            ocupado.add((i + a, j + b))
    importa(cat, id_, x, y, giro, z)
    return (x, y, z)


# ---------------------------------------------------------------------------------------------------------------- fachada
def fachada(cx, cy, normal, meio=6.6, z0=0.5, z1=20.0, passo=0.12):
    """Toques de fora para dentro numa fachada (normal = direção para fora). Devolve o plano da parede (coordenada no
    eixo da normal), as janelas (u0, u1, z0, z1) e a altura do alto da fachada."""
    nx, ny = normal
    ut = V((-ny, nx, 0))
    fora = V((cx, cy, 0)) + V((nx, ny, 0)) * 7.4  # na borda do lote (o vizinho começa depois)
    prof, vidros = {}, {}
    zmax = 0
    nu, nz = int(2 * meio / passo), int((z1 - z0) / passo)
    for i in range(nu + 1):
        for j in range(nz + 1):
            u = -meio + passo * i
            z = z0 + passo * j
            o = fora + ut * u + V((0, 0, z))
            r = raio(o, (-nx, -ny, 0))
            if not r:
                continue
            d = r[0].x * nx + r[0].y * ny
            prof[i, j] = d
            zmax = max(zmax, z)
            if r[3].startswith("janela"):
                vidros[i, j] = d
    ds = {}
    for d in prof.values():
        k = round(d, 1)
        ds[k] = ds.get(k, 0) + 1
    plano = max(ds, key=lambda k: ds[k]) if ds else None
    # janelas: componentes de células de vidro
    janelas, vistos = [], set()
    for c in vidros:
        if c in vistos:
            continue
        pilha, comp = [c], []
        vistos.add(c)
        while pilha:
            q = pilha.pop()
            comp.append(q)
            for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                r_ = (q[0] + a, q[1] + b)
                if r_ in vidros and r_ not in vistos:
                    vistos.add(r_)
                    pilha.append(r_)
        if len(comp) >= 6:
            us = [-meio + passo * q[0] for q in comp]
            zs = [z0 + passo * q[1] for q in comp]
            janelas.append((min(us), max(us), min(zs), max(zs)))
    return {"plano": plano, "janelas": janelas, "ut": ut, "n": V((nx, ny, 0)), "c": V((cx, cy, 0)), "zmax": zmax}


def na_parede(f, cat, id_, u, z, recuo=0.0):
    """Peça de parede (costas em y = 0) no plano da fachada f, na posição u ao longo dela e na altura z."""
    n, ut = f["n"], f["ut"]
    base = f["c"] + ut * u
    d_atual = base.x * n.x + base.y * n.y
    p = base + n * (f["plano"] - d_atual + recuo)
    giro = math.degrees(math.atan2(n.x, -n.y))
    return importa(cat, id_, p.x, p.y, giro, z)


# ---------------------------------------------------------------------------------------------------------------- cena
def monta():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rnd = random.Random(2)
    # ---- ruas: avenida de leste a oeste em y = 0 com T em (1, 0); rua norte em x = 15
    importa("ruas", "rua_cruzamento_t_faixas", *T(1, 0), 90)  # braço fechado ao sul (calçadão)
    for i in (-1, 0):
        importa("ruas", "rua_reta_faixa_pedestres" if i == 0 else "rua_reta", *T(i, 0), 90)
    importa("ruas", "rua_reta", *T(1, 1))
    importa("ruas", "rua_reta_faixa_pedestres", *T(1, 2))
    # ---- quarteirão 2 × 2: três prédios e a pracinha (calçada lisa)
    for i, j in ((-1, 1), (0, 1), (-1, 2), (0, 2)):
        importa("pisos", "piso_calcada_lisa", *T(i, j))
    importa(REG, "loja_esquina_padaria", *T(0, 1), 0)
    importa(REG, "apto_tijolo_pequeno", *T(0, 2), 90)
    importa(REG, "predio_farmacia", *T(-1, 2), 0)
    # ---- calçadão: ciclovia (faixa em X), laje de ladrilho, balaustrada e o mar
    for i in (-1, 0, 1):
        importa(PR, "ciclovia_faixa_pedestres" if i == 0 else "ciclovia_reta", *T(i, -1), 90)
        importa(PR, "laje_calcadao", *T(i, -2))
        importa("agua", "agua_aberta", *T(i, -3))
    yb = -37.5 + 0.26
    importa(PR, "balaustrada_15m", -15.0, yb)
    importa(PR, "balaustrada_15m", 0.0, yb)
    for k in range(4):
        importa(PR, "balaustrada_3m", 9.0 + 3 * k, yb)
    xc = 19.5 + 0.21  # canto no lugar do pilar do próximo módulo; o braço norte sai dele e fecha com o terminal
    importa(PR, "balaustrada_canto", xc, yb)
    importa(PR, "balaustrada_3m", xc, yb + 1.29, 90)
    importa(PR, "balaustrada_terminal", xc, yb + 3.0, 90)
    _calcadao()
    bpy.context.view_layer.update()
    _telhados()
    _fachadas()
    _calcadas(rnd)
    bpy.context.view_layer.update()


def _calcadao():
    for x in (-15.5, -4.5, 6.5, 17.0):
        importa(PR, "banco_calcadao", x, -35.4, 0)
    for x in (-10.0, 1.0, 12.0):
        importa(PR, "lixeira_calcadao", x, -35.6)
    for x in (-20.0, -10.0, 0.0, 10.0):
        importa(MOB, "poste_praca_4_lanternas", x + 5, -32.0)
    for x in (-19.0, -7.5, 4.0, 15.5):
        importa(VEG, "palmeira", x, -27.2)
    importa(PR, "estacao_bicicletas", -13.0, -23.4, 180)
    importa(PR, "totem_informacao_mapa", 8.5, -27.0, 0)
    importa(PR, "bebedouro_cachorro", -1.5, -27.0, 0)
    importa(PR, "conteiner_reciclagem_vidro", 20.0, -24.0)
    importa(PR, "lixeira_subterranea", 17.8, -24.0)
    importa("carros", "bicicleta_amarela", -5.0, -16.4, 90)
    importa("carros", "bicicleta_azul", 9.0, -13.6, -90)
    for x in (-19.0, -9.0, 15.0):  # calçada entre a avenida e a ciclovia
        importa(PR, "floreira_concreto_pequena", x, -10.2)
    importa(PR, "maquina_venda_lanches", 3.2, -9.0, 180)
    importa(PR, "maquina_venda_bebidas", 4.3, -9.0, 180)
    importa(PR, "gradil_calcada", -4.0, -12.9, 0)
    importa(PR, "gradil_calcada", -2.0, -12.9, 0)
    importa(MOB, "banco_praca_madeira", 10.0, -10.0, 180)
    importa(PR, "floreira_concreto_grande", -1.5, -32.0, 0)
    importa(PR, "floreira_concreto_grande", 12.5, -32.0, 0)


def _telhados():
    # padaria da esquina (baixa): condensadoras, caixa de fibra, exaustores, painel solar, parabólica e para-raios
    oc = set()
    m = mapa_telhado(*T(0, 1))
    LOG.append(f"telhado padaria z={m[1]}")
    poe_no_telhado(PR, "painel_solar_telhado", *T(0, 1), m, 1.5, 0, oc, (0, -2))
    poe_no_telhado(PR, "condensadora_telhado", *T(0, 1), m, 0.85, 0, oc, (3, 3))
    poe_no_telhado(PR, "exaustor_telhado", *T(0, 1), m, 0.4, 0, oc, (-3, 2))
    poe_no_telhado(PR, "exaustor_telhado", *T(0, 1), m, 0.4, 0, oc, (-3, -3))
    poe_no_telhado(PR, "antena_parabolica_grande", *T(0, 1), m, 1.0, 160, oc, (3, -3))
    poe_no_telhado(PR, "para_raios", *T(0, 1), m, 0.25, 0, oc, (0, 4))
    poe_no_telhado(PR, "caixa_dagua_fibra", *T(0, 1), m, 0.8, 0, oc, (-3, 4))
    # prédio de tijolo (4 andares): caixa d'água em torre, varal, mastro de antenas e condensadora
    oc = set()
    m = mapa_telhado(*T(0, 2))
    LOG.append(f"telhado tijolo z={m[1]}")
    poe_no_telhado(PR, "caixa_dagua_torre", *T(0, 2), m, 1.1, 0, oc, (-2, -2))
    poe_no_telhado(PR, "varal_roupas", *T(0, 2), m, 1.5, 90, oc, (2, 0))
    poe_no_telhado(PR, "antena_tv_mastro", *T(0, 2), m, 0.4, 30, oc, (-2, 3))
    # farmácia (3 andares): casa de máquinas, chaminé, antenas, caixa de fibra e exaustor
    oc = set()
    m = mapa_telhado(*T(-1, 2))
    LOG.append(f"telhado farmacia z={m[1]}")
    poe_no_telhado(PR, "casa_maquinas", *T(-1, 2), m, 1.6, 0, oc, (-2, 2))
    poe_no_telhado(PR, "chamine_tijolo", *T(-1, 2), m, 0.45, 0, oc, (3, 3))
    poe_no_telhado(PR, "antena_tv_espinha", *T(-1, 2), m, 0.5, 20, oc, (0, -3))
    poe_no_telhado(PR, "antena_parabolica_pequena", *T(-1, 2), m, 0.45, 200, oc, (3, -2))
    poe_no_telhado(PR, "caixa_dagua_fibra", *T(-1, 2), m, 0.8, 0, oc, (-3, -3))
    poe_no_telhado(PR, "exaustor_telhado", *T(-1, 2), m, 0.4, 0, oc, (3, 0))


def _fachadas():
    # padaria da esquina (canto arredondado: as janelas achadas por raio confundem o canto, então as peças vão em
    # posições fixas no plano da parede achado pelos raios). Leste: condensadoras entre os andares, luminária e câmera.
    f = fachada(*T(0, 1), (1, 0), z0=4.0, z1=7.0, meio=4.0)  # plano do andar de cima (o térreo é recuado)
    LOG.append(f"padaria leste: plano {f['plano']}")
    if f["plano"] is not None:
        for u in (-2.6, 1.4):
            na_parede(f, PR, "condensadora_parede", u, 4.55)
        na_parede(f, PR, "luminaria_fachada", -3.6, 2.5)
        na_parede(f, PR, "camera_seguranca", 3.4, 3.4)
    # prédio de tijolo (frente para leste): escada de incêndio no lado sul, toldos, condensadoras e porta com interfone
    f = fachada(*T(0, 2), (0, -1), z1=16)
    LOG.append(f"tijolo sul: plano {f['plano']}, {len(f['janelas'])} janelas")
    if f["plano"] is not None:
        for k in range(3):
            na_parede(f, PR, "escada_incendio_modulo", 0.0, 3.6 + 3.2 * k - 0.6 + 0.6)
    f = fachada(*T(0, 2), (1, 0), z1=16)
    LOG.append(f"tijolo leste: plano {f['plano']}, {len(f['janelas'])} janelas")
    if f["plano"] is not None:
        altas = sorted([j for j in f["janelas"] if j[2] > 3.0], key=lambda j: (j[2], j[0]))
        for u0, u1, z0, z1 in altas[:2]:
            na_parede(f, PR, "toldo_janela", (u0 + u1) / 2, z1 - 0.35)
        for u0, u1, z0, z1 in [j for j in altas if j[2] > 7][:2]:
            na_parede(f, PR, "condensadora_parede", (u0 + u1) / 2 + 0.2, z0 - 0.85)
        na_parede(f, PR, "interfone_campainha", -1.6, 1.15)
        na_parede(f, PR, "caixa_correio_parede", -2.1, 0.95)
        na_parede(f, PR, "luminaria_fachada", 1.6, 2.4)
        na_parede(f, PR, "luminaria_fachada", -2.8, 2.4)
    # farmácia (frente para o sul, para a pracinha)
    f = fachada(*T(-1, 2), (0, -1), z1=14)
    LOG.append(f"farmacia sul: plano {f['plano']}, {len(f['janelas'])} janelas")
    if f["plano"] is not None:
        altas = sorted([j for j in f["janelas"] if j[2] > 4.0], key=lambda j: (j[2], j[0]))
        for u0, u1, z0, z1 in altas[:3]:
            na_parede(f, PR, "toldo_janela", (u0 + u1) / 2, z1 - 0.35)
        na_parede(f, PR, "camera_seguranca", -6.0, 3.3)


def _calcadas(rnd):
    # pracinha de comércio (−1, 1): banca, chaveiro, frutas, máquinas, caixa eletrônico, floreiras e balizadores
    cx, cy = T(-1, 1)
    importa(PR, "banca_jornal", cx - 3.6, cy + 1.0, 0)
    importa(PR, "quiosque_chaveiro", cx + 3.6, cy + 2.6, 0)
    importa(PR, "banca_frutas", cx + 0.4, cy - 3.2, 0)
    importa(PR, "maquina_venda_bebidas", cx - 6.4, cy + 5.4, 90)
    importa(PR, "maquina_venda_lanches", cx - 6.4, cy + 4.2, 90)
    importa(PR, "caixa_eletronico_rua", cx + 6.2, cy - 2.0, -90)
    importa(PR, "floreira_concreto_grande", cx - 3.4, cy - 4.8, 0)
    importa(PR, "floreira_concreto_pequena", cx + 3.4, cy - 5.2)
    importa(PR, "floreira_concreto_pequena", cx + 5.6, cy - 5.2)
    importa(VEG, "arvore_redonda_media", cx - 1.0, cy + 5.5)
    importa(MOB, "banco_praca_madeira", cx + 1.6, cy + 5.6, 180)
    importa(MOB, "lixeira_comum", cx + 0.0, cy + 1.6)
    importa(PR, "corrente_balizadores", cx - 4.6, cy - 6.9, 0)
    for x in (-0.6, 1.4):
        importa(PR, "balizador_fixo", cx + x, cy - 6.9)
    importa(PR, "balizador_retratil", cx + 0.4, cy - 6.9)
    # calçada norte da avenida (y de 3,75 a 7,5), de oeste para leste
    y_meio, y_guia = 5.6, 4.15
    importa(PR, "parquimetro", -20.0, y_guia, 0)
    importa(MOB, "poste_rua", -17.0, y_guia + 0.2, 180)
    importa(PR, "carregador_carro_eletrico", -13.0, y_guia + 0.1, 0)
    importa("carros", "sedan_azul", -13.0, 1.9, -90)
    importa(MOB, "hidrante", -9.5, y_guia + 0.1)
    importa(PR, "parquimetro", -7.0, y_guia, 0)
    importa(MOB, "ponto_onibus", -2.0, y_meio + 0.4, 0)
    importa(MOB, "poste_rua", 2.0, y_guia + 0.2, 180)
    importa(PR, "gradil_calcada", 4.4, y_guia - 0.05, 0)
    importa(PR, "gradil_calcada", 6.4, y_guia - 0.05, 0)
    importa(PR, "grelha_boca_lobo", -4.5, 3.2, 0, z=-0.1)
    importa(PR, "grelha_boca_lobo", 6.0, 3.2, 0, z=-0.1)
    importa(PR, "tampa_bueiro", -11.0, 1.5, 0, z=-0.1)
    # esquina nordeste da avenida com a rua norte (canto do T)
    importa(PR, "placa_direcao_setas", 9.0, 5.3, 20)
    importa(MOB, "traffic_light_002_pacote", 9.75, 5.25, 0)
    importa(MOB, "traffic_light_002_pacote", 20.25, 5.25, 90)
    importa(PR, "balizador_fixo", 8.0, 4.15)
    # calçada oeste da rua norte (x de 7,5 a 11,25)
    x_guia = 11.25 - 0.4
    importa(PR, "floreira_concreto_pequena", 9.0, 9.5)
    importa(MOB, "poste_rua", x_guia + 0.2, 13.0, -90)
    importa(PR, "lixeira_subterranea", 9.2, 17.0)
    importa(MOB, "caixa_correio", 9.0, 20.0, 90)
    importa(PR, "parquimetro", x_guia, 25.0, -90)
    importa(MOB, "bicicletario", 9.3, 28.5, 90)
    # calçada leste da rua norte: obra com cones, cavalete e barreiras em volta de um bueiro aberto
    importa(PR, "tampa_bueiro", 17.0, 22.0, 0, z=-0.1)
    for p in ((16.2, 20.6), (17.8, 20.6), (18.4, 22.0), (17.8, 23.4), (16.2, 23.4)):
        importa(PR, "cone_transito", p[0], p[1], rnd.uniform(0, 90), z=-0.1)
    importa(PR, "cone_transito_pisca", 15.6, 22.0, 0, z=-0.1)
    importa(PR, "cavalete_obra", 17.0, 18.8, 0, z=-0.1)
    importa(PR, "barreira_plastica", 20.0, 22.0, 90)
    importa(PR, "barreira_plastica", 20.0, 23.4, 90)
    importa(MOB, "poste_rua", 19.15, 13.0, 90)
    importa(PR, "maquina_venda_bebidas", 21.6, 9.6, -90)
    importa(MOB, "telefone_publico", 21.4, 17.0, -90)
    importa(PR, "floreira_concreto_pequena", 21.2, 27.0)
    # calçada sul da avenida (y de −7,5 a −3,75): ponto, bancos, lixeiras
    importa(MOB, "lixeira_reciclagem", -18.0, -6.4, 0)
    importa(MOB, "poste_rua", -9.0, -4.35, 0)
    importa(MOB, "poste_rua", 8.0, -4.35, 0)
    importa(PR, "parquimetro", -15.0, -4.15, 180)
    importa(MOB, "banco_praca_madeira", 3.0, -6.2, 180)
    importa(PR, "floreira_concreto_pequena", 12.0, -6.0)
    importa(PR, "tampa_bueiro", 3.0, -1.6, 0, z=-0.1)


# ---------------------------------------------------------------------------------------------------------------- render
LUZ_IDS = ("poste", "luminaria", "spotlight", "ponto_onibus", "caixa_eletronico", "banca_jornal", "quiosque", "casa_maq",
           "banca_frutas", "totem", "carregador", "maquina_venda")


def luzes_noturnas():
    n = 0
    for cat, id_, raiz, novos in RAIZES:
        if not any(k in id_ for k in LUZ_IDS):
            continue
        pts = []
        for o in novos:
            if o.type != "MESH" or o.hide_render:
                continue
            for p in o.data.polygons:
                m = o.data.materials[p.material_index] if p.material_index < len(o.data.materials) else None
                nome = m.name.split(".")[0] if m else ""
                if nome == "luz" or (nome.startswith("estampa_pr_") and any(k in id_ for k in ("maquina", "totem",
                                                                                               "carregador"))):
                    pts.append(o.matrix_world @ p.center)
        grupos = []
        for p in pts:
            for g in grupos:
                if (g[0] / g[1] - p).length < 0.8:
                    g[0] += p
                    g[1] += 1
                    break
            else:
                grupos.append([p.copy(), 1])
        for soma, k in grupos:
            c = soma / k
            ld = bpy.data.lights.new("lampada", "POINT")
            ld.energy = 900 if c.z > 6 else (160 if c.z > 2.5 else 60)
            ld.color = (1.0, 0.82, 0.55)
            ld.shadow_soft_size = 0.25
            ob = bpy.data.objects.new("lampada", ld)
            bpy.context.scene.collection.objects.link(ob)
            ob.location = c - V((0, 0, 0.2))
            n += 1
    print("luzes", n, flush=True)


VISTAS = {
    "longe": ((-23.0, -46.0, 0.0), (23.0, 38.0, 14.0), (0.55, -1.0, 0.85), (1800, 1500)),
    "esquina": ((-23.0, -8.0, 0.0), (23.0, 30.0, 4.0), (0.55, -1.0, 0.75), (1800, 1300)),
    "telhados": ((-8.0, 7.0, 9.0), (8.0, 38.0, 20.0), (0.75, -1.0, 1.05), (1800, 1300)),
    "calcadao": ((-23.0, -38.0, 0.0), (23.0, -8.0, 3.0), (0.4, -1.0, 0.6), (1800, 1100)),
}


def render(arquivo, noite, vista, amostras=36):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    lo, hi, d, res = VISTAS[vista]
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*mb._lin("#1B2A4A" if noite else "#9DB4D9"), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.3 if noite else 0.6
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    chao = bpy.data.meshes.new("chao")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=500)
    bm.to_mesh(chao)
    bm.free()
    m = bpy.data.materials.new("chao_vitrine")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*mb._lin("#141E36" if noite else
                                                                                         "#2A3D63"), 1)
    chao.materials.append(m)
    ob = bpy.data.objects.new("chao", chao)
    scn.collection.objects.link(ob)
    ob.location = (0, 0, -2.0)
    ld = bpy.data.lights.new("sol", "SUN")
    ld.energy = 0.35 if noite else 3.0
    if noite:
        ld.color = (0.6, 0.7, 1.0)
    ld.angle = math.radians(6)
    sol = bpy.data.objects.new("sol", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(42), 0, math.radians(-38))
    if noite:
        luzes_noturnas()
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    lo, hi = V(lo), V(hi)
    pts = [V((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    c = (lo + hi) / 2
    dd = V(d).normalized()
    cam.location = c + dd * 300
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    R = cam.rotation_euler.to_matrix().inverted()
    proj = [R @ (p - c) for p in pts]
    ex = max(q.x for q in proj) - min(q.x for q in proj)
    ey = max(q.y for q in proj) - min(q.y for q in proj)
    cd.ortho_scale = max(ex, ey * res[0] / res[1]) * 1.02
    cam.location += cam.matrix_world.to_3x3() @ V(((max(q.x for q in proj) + min(q.x for q in proj)) / 2,
                                                   (max(q.y for q in proj) + min(q.y for q in proj)) / 2, 0))
    cd.clip_end = 900
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arquivo
    bpy.ops.render.render(write_still=True)
    print("render", arquivo, flush=True)


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    SAIDA = a[0]
    modos = [x for x in a[1:] if x in ("dia", "noite")] or ["dia", "noite"]
    vistas = [x for x in a[1:] if x in VISTAS] or list(VISTAS)
    for modo in modos:
        for vista in vistas:
            RAIZES.clear()
            LOG.clear()
            monta()
            for linha in LOG:
                print("cena:", linha, flush=True)
            if "--sem-render" in a:
                continue
            nome = "teste_cena" + ("" if vista == "longe" else "_" + vista) + "_" + modo + ".png"
            render(os.path.join(SAIDA, PR, nome), modo == "noite", vista)
