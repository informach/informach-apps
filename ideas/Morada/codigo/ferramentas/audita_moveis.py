"""Auditoria da biblioteca de móveis lendo os GLB direto (sem Blender).
Confere, peça por peça:
- catálogo x GLB (id, arquivo, miniatura existe e não está vazia);
- uma raiz só; materiais permitidos;
- interativos: dados completos, eixo/direção unitários, ângulo e curso plausíveis, e se a porta/gaveta abre para fora
  (frente = +Z no glTF) e não para dentro do corpo nem para a parede;
- slots dentro da peça; colisão cobrindo a peça;
- apoio no chão (chão/apoio), encosto na parede (parede), fixação no teto (teto);
- triângulos.
Uso: python3 -I audita_moveis.py <moveis_out> [saida.json]"""
import json
import math
import os
import struct
import sys

from PIL import Image

O = sys.argv[1]
SAIDA = sys.argv[2] if len(sys.argv) > 2 else None
PERMITIDOS = {"atlas", "vidro", "espelho", "luz", "agua", "neon", "janela", "janela_fria", "janela_apagada"}


def le_glb(caminho):
    b = open(caminho, "rb").read()
    n = struct.unpack_from("<I", b, 12)[0]
    return json.loads(b[20:20 + n])


def qmat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def mat4(no):
    if "matrix" in no:
        m = no["matrix"]
        return [[m[0], m[4], m[8], m[12]], [m[1], m[5], m[9], m[13]], [m[2], m[6], m[10], m[14]], [0, 0, 0, 1]]
    t = no.get("translation", [0, 0, 0])
    r = qmat(no.get("rotation", [0, 0, 0, 1]))
    s = no.get("scale", [1, 1, 1])
    return [[r[i][0] * s[0], r[i][1] * s[1], r[i][2] * s[2], t[i]] for i in range(3)] + [[0, 0, 0, 1]]


def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def ap(m, p):
    return [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3)]


def rot_eixo(eixo, ang):
    x, y, z = eixo
    c, s, t = math.cos(ang), math.sin(ang), 1 - math.cos(ang)
    return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
            [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
            [t * x * z - s * y, t * y * z + s * x, t * z * z + c]]


def caixa_malha(g, mi, M):
    """AABB (no espaço da raiz) de uma malha com a matriz M; e triângulos."""
    lo, hi, tris = [1e9] * 3, [-1e9] * 3, 0
    for pr in g["meshes"][mi]["primitives"]:
        ac = g["accessors"][pr["attributes"]["POSITION"]]
        mn, mx = ac["min"], ac["max"]
        for cx in (mn[0], mx[0]):
            for cy in (mn[1], mx[1]):
                for cz in (mn[2], mx[2]):
                    p = ap(M, [cx, cy, cz])
                    lo = [min(lo[i], p[i]) for i in range(3)]
                    hi = [max(hi[i], p[i]) for i in range(3)]
        if "indices" in pr:
            tris += g["accessors"][pr["indices"]]["count"] // 3
        else:
            tris += ac["count"] // 3
    return lo, hi, tris


def audita_item(cat, it):
    prob = []
    arq = os.path.join(O, cat, it.get("arquivo", f"glb/{it['id']}.glb"))
    if not os.path.exists(arq):
        return ["GLB não existe"], {}
    g = le_glb(arq)
    cena = g["scenes"][g.get("scene", 0)]
    raizes = cena["nodes"]
    if len(raizes) != 1:
        prob.append(f"{len(raizes)} raízes")
    # percorre a hierarquia
    nos = []

    def anda(i, M, pai_int):
        no = g["nodes"][i]
        Mi = mul(M, mat4(no))
        ex = no.get("extras", {})
        nos.append((i, no, Mi, M, ex, pai_int))
        for c in no.get("children", []):
            anda(c, Mi, i if ex.get("interativo") else pai_int)

    I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    for r in raizes:
        anda(r, I, None)
    lo, hi, tris = [1e9] * 3, [-1e9] * 3, 0
    corpo_lo, corpo_hi = None, None
    caixas_int = {}
    for i, no, Mi, M, ex, pai in nos:
        if "mesh" in no:
            l, h, t = caixa_malha(g, no["mesh"], Mi)
            lo = [min(lo[k], l[k]) for k in range(3)]
            hi = [max(hi[k], h[k]) for k in range(3)]
            tris += t
            if ex.get("interativo"):
                caixas_int[i] = (l, h)
            elif i in raizes:
                corpo_lo, corpo_hi = l, h
    mats = {m.get("name", "") for m in g.get("materials", [])}
    ruins = [m for m in mats if m not in PERMITIDOS and not m.startswith(("estampa_", "janela_", "neon_", "brilho_", "luz_"))]
    if ruins:
        prob.append(f"materiais fora do padrão: {ruins}")
    dims = [hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]]  # l, p, a
    cd = it.get("dims", [0, 0, 0])
    if any(abs(dims[k] - cd[k]) > 0.03 for k in range(3)):
        prob.append(f"dims do catálogo {cd} ≠ GLB {[round(x, 3) for x in dims]}")
    fix = it.get("fixacao", "chao")
    INFRA = {"ruas", "pisos", "estacionamentos", "ferrovia", "pontes", "agua", "estruturas"}
    if it.get("categoria") in INFRA or "linha_dagua" in it:
        pass  # lajes, água e fundações descem abaixo da calçada de propósito
    elif "lote" in it:
        if lo[1] > 0.012 or lo[1] < -0.15:
            prob.append(f"base em y={lo[1]:.3f} (prédio deve assentar na calçada)")
    elif fix in ("chao", "apoio") and abs(lo[1]) > 0.012:
        prob.append(f"base em y={lo[1]:.3f} (deveria tocar o chão)")
    if fix == "parede" and abs(hi[2] - 0) > 0.02 and abs(lo[2]) > 0.02:
        # glTF z = −y do Blender; o fundo da peça de parede fica em y=0 (Blender) → z=0 no glTF, corpo em z>0
        prob.append(f"peça de parede não encosta no plano da parede (z de {lo[2]:.3f} a {hi[2]:.3f})")
    if fix == "teto" and abs(hi[1]) > 0.02:
        prob.append(f"peça de teto com topo em y={hi[1]:.3f}")
    # interativos
    n_int = 0
    for i, no, Mi, M, ex, pai in nos:
        t = ex.get("interativo")
        if not t:
            continue
        n_int += 1
        nome = no.get("name", "?")
        piv = ap(M, no.get("translation", [0, 0, 0]))
        if t == "porta":
            e, a = ex.get("eixo"), ex.get("angulo")
            if not e or a is None:
                prob.append(f"{nome}: porta sem eixo/ângulo")
                continue
            if abs(math.hypot(*e) - 1) > 0.02:
                prob.append(f"{nome}: eixo não unitário {e}")
            if not (0.25 < abs(a) <= math.pi + 0.01):
                prob.append(f"{nome}: ângulo estranho {a:.2f}")
            if i in caixas_int:
                l, h = caixas_int[i]
                c = [(l[k] + h[k]) / 2 for k in range(3)]
                v = [c[k] - piv[k] for k in range(3)]
                R = rot_eixo(e, a)
                vn = [sum(R[r][k] * v[k] for k in range(3)) for r in range(3)]
                cn = [piv[k] + vn[k] for k in range(3)]
                frente_ok = cn[2] > piv[2] - 0.03 or cn[1] > c[1] + 0.05  # foi para a frente, ou subiu (tampa)
                # entrar no corpo: centro aberto bem dentro da caixa do corpo
                dentro = corpo_lo and all(corpo_lo[k] + 0.04 < cn[k] < corpo_hi[k] - 0.04 for k in range(3))
                if not frente_ok:
                    prob.append(f"{nome}: porta abre para trás (centro aberto z={cn[2]:.2f}, pivô z={piv[2]:.2f})")
                elif dentro and abs(e[1]) > 0.9:
                    prob.append(f"{nome}: porta aberta entra no corpo")
                if corpo_lo and not all(corpo_lo[k] - 0.25 < piv[k] < corpo_hi[k] + 0.25 for k in range(3)):
                    prob.append(f"{nome}: pivô longe da peça {[round(x, 2) for x in piv]}")
        elif t in ("gaveta", "correr"):
            d, cu = ex.get("direcao"), ex.get("curso")
            if not d or cu is None:
                prob.append(f"{nome}: {t} sem direção/curso")
                continue
            if abs(math.hypot(*d) - 1) > 0.02:
                prob.append(f"{nome}: direção não unitária {d}")
            if not (0.005 < cu <= max(dims) + 0.01):
                prob.append(f"{nome}: curso estranho {cu}")
            if t == "gaveta" and d[2] < -0.5:
                prob.append(f"{nome}: gaveta abre para a parede (−Z)")
        else:
            prob.append(f"{nome}: interativo desconhecido {t}")
    if n_int != len(it.get("interativos", [])):
        prob.append(f"catálogo diz {len(it.get('interativos', []))} interativos, GLB tem {n_int}")
    # slots
    tol = 0.06
    n_slot = 0
    for i, no, Mi, M, ex, pai in nos:
        if not ex.get("slot"):
            continue
        n_slot += 1
        p = ap(Mi, [0, 0, 0])
        tam = ex.get("tamanho")
        if not tam or min(tam) <= 0:
            prob.append(f"{no.get('name')}: slot sem tamanho")
            continue
        if not all(lo[k] - tol <= p[k] <= hi[k] + tol for k in range(3)):
            prob.append(f"{no.get('name')}: slot fora da peça {[round(x, 2) for x in p]}")
    if n_slot != len(it.get("slots", [])):
        prob.append(f"catálogo diz {len(it.get('slots', []))} slots, GLB tem {n_slot}")
    # colisão
    col = it.get("colisao", [])
    if not col:
        if it.get("fixacao") != "parede" and not it.get("decalque"):  # placas de parede e decalques não colidem
            prob.append("sem colisão")
    else:
        clo = [min(c["centro"][k] - c["tamanho"][k] / 2 for c in col) for k in range(3)]
        chi = [max(c["centro"][k] + c["tamanho"][k] / 2 for c in col) for k in range(3)]
        # o corpo (sem portas) deve estar coberto, com folga para puxadores e pés finos
        ref_lo, ref_hi = (corpo_lo, corpo_hi) if corpo_lo else (lo, hi)
        for k, eixo in enumerate("xyz"):
            # peças de cidade (prédios, viadutos): folga proporcional para beirais, antenas e enfeites
            folga = max(0.12, 0.08 * (ref_hi[k] - ref_lo[k])) if (hi[k] - lo[k]) > 4 else 0.12
            if clo[k] > ref_lo[k] + folga or chi[k] < ref_hi[k] - folga:
                prob.append(f"colisão não cobre a peça no eixo {eixo} ({clo[k]:.2f}..{chi[k]:.2f} x {ref_lo[k]:.2f}..{ref_hi[k]:.2f})")
                break
            if clo[k] < lo[k] - 0.1 or chi[k] > hi[k] + 0.1:
                prob.append(f"colisão passa da peça no eixo {eixo}")
                break
    # miniatura
    mini = os.path.join(O, cat, it.get("miniatura", f"miniaturas/{it['id']}.webp"))
    if not os.path.exists(mini):
        prob.append("sem miniatura")
    else:
        im = Image.open(mini).convert("RGBA")
        a = im.getchannel("A")
        cob = sum(1 for v in a.getdata() if v > 20) / (im.size[0] * im.size[1])
        if cob < 0.04:
            prob.append(f"miniatura quase vazia ({cob:.0%})")
        bb = a.point(lambda v: 255 if v > 20 else 0).getbbox()
        if bb and (bb[0] <= 0 or bb[1] <= 0 or bb[2] >= im.size[0] or bb[3] >= im.size[1]):
            prob.append("miniatura cortada na borda")
    return prob, {"tris": tris, "int": n_int, "slots": n_slot}


resumo = {"categorias": {}, "problemas": {}, "ids_repetidos": []}
vistos = {}
tot_tris = 0
n_tot = 0
for cat in sorted(os.listdir(O)):
    f = os.path.join(O, cat, "catalogo.json")
    if not os.path.exists(f) or cat.startswith(("teste", "_")):
        continue
    c = json.load(open(f))
    tris_cat = []
    for it in c["itens"]:
        if it["id"] in vistos:
            resumo["ids_repetidos"].append((it["id"], vistos[it["id"]], cat))
        vistos[it["id"]] = cat
        p, info = audita_item(cat, it)
        if p:
            resumo["problemas"][f"{cat}/{it['id']}"] = p
        tris_cat.append(info.get("tris", 0))
    n = len(c["itens"])
    n_tot += n
    tot_tris += sum(tris_cat)
    resumo["categorias"][cat] = {"n": n, "tris_total": sum(tris_cat), "tris_medio": round(sum(tris_cat) / max(1, n)),
                                 "tris_max": max(tris_cat or [0])}
resumo["total"] = {"itens": n_tot, "tris": tot_tris, "tris_medio": round(tot_tris / max(1, n_tot))}
print(json.dumps(resumo["total"], ensure_ascii=False))
print("itens com problema:", len(resumo["problemas"]), "| ids repetidos:", len(resumo["ids_repetidos"]))
tipos = {}
for k, v in resumo["problemas"].items():
    for p in v:
        chave = p.split(":")[-1].split("(")[0].strip() if ":" in p else p.split("(")[0].strip()
        chave = chave[:60]
        tipos[chave] = tipos.get(chave, 0) + 1
for k, v in sorted(tipos.items(), key=lambda t: -t[1])[:30]:
    print(f"{v:4d}  {k}")
if SAIDA:
    json.dump(resumo, open(SAIDA, "w"), ensure_ascii=False, indent=1)
