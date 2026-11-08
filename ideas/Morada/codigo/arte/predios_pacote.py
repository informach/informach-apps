"""Biblioteca de cidade do Morada: os 4 prédios do pacote gratuito Cartoon City que faltavam (uso interno, não distribuir).

Uso (ver GUIA_PREDIOS.md e GUIA_CIDADE.md):
  MOVEIS_THREADS=1 CIDADE_PACOTE_FBX=SP/ideias/Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx \
  CIDADE_PACOTE_TEX=SP/ideias/Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx/Textures1.png \
  blender-venv/bin/python -I morada-art/predios_pacote.py -- SP/cidade_out [ids...] [debug]
Sem ids, importa os quatro. Cada um vai para a categoria do seu estilo (predios_ecologicos ou, pela altura,
arranha_ceus / predios_regulares) e o Catalogo acrescenta ao catalogo.json sem apagar as peças que já estão lá.
"vitrine [dia|noite] [categoria]" renderiza as vitrines de conferência (VITRINES) em <categoria>/vitrine_pacote[_noite].png.
"debug" não exporta: pinta as classes de face (janela, vidro horizontal) e grava vistas em SP/predios_pacote_sonda.

O que muda em relação ao cb.importa_cidade:
- os planos "_NightLight" do pacote (janelas acesas pintadas, que brilhariam de dia) saem;
- as janelas viram faces próprias com janela / janela_fria / janela_apagada (≈ 40 % apagadas). Janela é: face do
  material "Glass" do pacote em pé (|nz| < 0,5) com 1,5 m ou mais de altura (as de 1,2 m são guarda-corpos de
  varanda e continuam vidro), ou face do material de cor cujo pixel no atlas Textures1.png é o azul
  saturado do vidro (matiz 0,52–0,68, saturação ≥ 0,6, valor ≥ 0,7; no Eco_Building_Grid é o plano azul da fachada
  inteira, atrás dos painéis "Glass", que aparecia onde o pacote punha os _NightLight). O azul-claro pouco saturado
  (guarda-corpos e divisórias internas) e o vidro deitado continuam cor/vidro;
- vidro grande é fatiado em painéis de um andar por ~3 m, para a noite acender em quadradinhos e não fachada inteira;
- escala para caber no lote (projeção até 28 × 28 m), origem no centro da projeção, base em z = 0, frente para −Y.
"""
import colorsys
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402
import cidade_base as cb  # noqa: E402

V = Vector
APAG, FRIAS = 0.40, 0.25
LOTE_MAX = 28.0  # projeção máxima num lote de 2 × 2 quadras

# (id, rótulo, fbx, categoria pedida, grupo, tags, estilo, rotação em graus em z)
# Categoria "auto": arranha_ceus se a altura final for ≥ 60 m, senão predios_regulares.
PECAS = [
    ("predio_eco_grade_verde_pacote", "Prédio ecológico de painéis verdes (pacote)", "Eco_Building_Grid",
     "predios_ecologicos", "eco_grade_verde_pacote", ["predio", "ecologico", "jardim_vertical", "pacote", "2x2"],
     "ecologico", 0),
    ("torre_eco_rampa_jardim_pacote", "Torre ecológica em rampa com jardins (pacote)", "Eco_Building_Slope",
     "predios_ecologicos", "eco_rampa_pacote", ["predio", "ecologico", "torre", "terracos", "plantas", "pacote", "2x2"],
     "ecologico", 0),
    ("predio_eco_terracos_pacote", "Prédio ecológico de terraços com telhado verde (pacote)", "Eco_Building_Terrace",
     "predios_ecologicos", "eco_terracos_pacote", ["predio", "ecologico", "terracos", "telhado_verde", "pacote", "2x2"],
     "ecologico", 0),
    ("torre_torcida_fitas_pacote", "Torre torcida com fitas (pacote)", "Regular_Building_TwistedTower_Large",
     "auto", "torre_torcida_fitas_pacote", ["predio", "torre", "torcida", "vidro", "pacote", "2x2"],
     "regular", 0),
]


def _classe(nm, rgb, normal, alt):
    """'janela', 'vidro' (deitado ou guarda-corpo) ou None (cor do atlas). alt = altura da face (m, escala do pacote)."""
    if "glass" in nm:  # o "Glass" de 1,2 m de altura é guarda-corpo de varanda, não janela
        return "janela" if abs(normal.z) < 0.5 and alt >= 1.5 else "vidro"
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    if 0.52 <= h <= 0.68 and s >= 0.6 and v >= 0.7 and abs(normal.z) < 0.5:
        return "janela"
    return None


def importa_predio(nome):
    """Importa o FBX como o cb.importa_cidade (cores do atlas → paleta), sem os planos _NightLight; as faces de
    janela ficam com o material "janela" (o sorteio quente/fria/apagada vem depois do fatiamento)."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(cb.CC_DIR, nome + ".fbx"))
    novos = [o for o in bpy.data.objects if o not in antes]
    img = bpy.data.images.load(cb.CC_TEX, check_existing=True)
    W, Hh = img.size
    px = img.pixels[:]
    mb.materiais()
    cache = {}
    out = []
    cont = {}
    for o in novos:
        if o.type != "MESH" or o.name.lower().endswith("_nightlight"):
            continue
        me = o.data.copy()
        me.transform(o.matrix_world)
        mats = [m.name.lower().split(".")[0] if m else "" for m in me.materials]
        bm = bmesh.new()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            nm = mats[f.material_index] if f.material_index < len(mats) else ""
            us = [lo[uvl].uv for lo in f.loops]
            u = sum(q[0] for q in us) / len(us)
            v = sum(q[1] for q in us) / len(us)
            k = (min(Hh - 1, max(0, int(v % 1 * Hh))) * W + min(W - 1, max(0, int(u % 1 * W)))) * 4
            rgb = tuple(round(c, 3) for c in px[k:k + 3])
            zs = [vv.co.z for vv in f.verts]
            cl = _classe(nm, rgb, f.normal, max(zs) - min(zs))
            cont[cl] = cont.get(cl, 0) + 1
            if cl == "janela":
                f.material_index = mb.MAT_NOMES.index("janela")
                continue
            if cl == "vidro":
                f.material_index = mb.MAT_NOMES.index("vidro")
                continue
            if "emissive" in nm:
                f.material_index = mb.MAT_NOMES.index("luz")
                continue
            if rgb not in cache:
                cache[rgb] = mb.cor_mais_proxima(rgb)
            cor = cache[rgb]
            uu = mb.uv_cor(cor)
            for lo in f.loops:
                lo[uvl].uv = uu
            f.material_index = 0
        if uvl.name != "UVMap":
            uvl.name = "UVMap"
        mesh = bpy.data.meshes.new(o.name)
        bm.to_mesh(mesh)
        bm.free()
        for n in mb.MAT_NOMES:
            mesh.materials.append(bpy.data.materials[n])
        ob = bpy.data.objects.new(o.name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        out.append(ob)
    for o in novos:
        bpy.data.objects.remove(o)
    print("classes", nome, cont, flush=True)
    return out


def enquadra(objs, rot):
    """Gira (graus em z), escala para caber no lote e põe a origem no centro da projeção com a base em z = 0.
    Devolve (escala, lote)."""
    from mathutils import Matrix
    R = Matrix.Rotation(math.radians(rot), 4, "Z")
    for o in objs:
        o.data.transform(R)
    lo, hi = mb.bbox(objs)
    lx, ly = hi.x - lo.x, hi.y - lo.y
    esc = min(1.0, LOTE_MAX / max(lx, ly))
    c = V(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    M = Matrix.Scale(esc, 4) @ Matrix.Translation(-c)
    for o in objs:
        o.data.transform(M)
        o.data.update()
    lote = [1 if lx * esc <= 13.0 + 1e-3 else 2, 1 if ly * esc <= 13.0 + 1e-3 else 2]
    return esc, lote


def fatia_vidros(objs, andar, larg=3.0, area_max=14.0):
    """Painéis de vidro maiores que area_max viram células de um andar por ~larg m (faces planas, cortes só nelas)."""
    idx_j = mb.MAT_NOMES.index("janela")
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        for _ in range(2):  # 1ª passada: andares (planos z); 2ª: colunas ao longo da fachada
            grandes = [f for f in bm.faces if f.material_index == idx_j and f.calc_area() > area_max]
            for f in grandes:
                if not f.is_valid:
                    continue
                n = f.normal.copy()
                vs = [v.co.copy() for v in f.verts]
                geom = [f] + list(f.edges) + list(f.verts)
                if _ == 0:
                    z0, z1 = min(v.z for v in vs), max(v.z for v in vs)
                    k = max(1, round((z1 - z0) / andar))
                    cortes = [(V((0, 0, z0 + (z1 - z0) * i / k)), V((0, 0, 1))) for i in range(1, k)]
                else:
                    t = V((-n.y, n.x, 0))
                    if t.length < 1e-4:
                        continue
                    t.normalize()
                    ss = [v.dot(t) for v in vs]
                    s0, s1 = min(ss), max(ss)
                    k = max(1, round((s1 - s0) / larg))
                    cortes = [(t * (s0 + (s1 - s0) * i / k), t) for i in range(1, k)]
                for co, no in cortes:
                    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
                    geom = list({g for g in geom if g.is_valid} | set(res["geom"]))
                    geom = [g for g in geom if not isinstance(g, bmesh.types.BMFace) or g.material_index == idx_j]
        bm.to_mesh(o.data)
        bm.free()


def sorteia_janelas(objs, semente):
    """Cada face de janela sorteia janela_apagada (APAG), janela_fria (FRIAS) ou janela (quente)."""
    rnd = random.Random(semente)
    idx = {n: mb.MAT_NOMES.index(n) for n in ("janela", "janela_fria", "janela_apagada")}
    n_tot = {k: 0 for k in idx}
    for o in objs:
        for p in o.data.polygons:
            if p.material_index != idx["janela"]:
                continue
            r = rnd.random()
            k = "janela_apagada" if r < APAG else "janela_fria" if r < APAG + FRIAS else "janela"
            p.material_index = idx[k]
            n_tot[k] += 1
    return n_tot


def andares_de(objs, alt_andar_min=2.6):
    """Andares pelas cotas das bases das janelas (agrupadas a cada 1,2 m)."""
    idxs = {mb.MAT_NOMES.index(n) for n in ("janela", "janela_fria", "janela_apagada")}
    zs = []
    for o in objs:
        for p in o.data.polygons:
            if p.material_index in idxs:
                zs.append(min(o.data.vertices[i].co.z for i in p.vertices))
    zs.sort()
    niveis = []
    for z in zs:
        if not niveis or z - niveis[-1] > alt_andar_min:
            niveis.append(z)
    return niveis


def colisao_faixas(objs, n):
    """n caixas empilhadas: cada faixa de altura leva o retângulo do que há nela (o corpo, sem árvores do telhado
    por fora da laje, que entram junto: são baixas)."""
    vs = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    ztop = max(v.z for v in vs)
    cx = []
    for i in range(n):
        z0, z1 = ztop * i / n, ztop * (i + 1) / n
        sel = [v for v in vs if z0 - 1e-3 <= v.z <= z1 + 1e-3]
        if not sel:
            continue
        x0, x1 = min(v.x for v in sel), max(v.x for v in sel)
        y0, y1 = min(v.y for v in sel), max(v.y for v in sel)
        cx.append((((x0 + x1) / 2, (y0 + y1) / 2, z0), (x1 - x0, y1 - y0, z1 - z0)))
    return cx


def debug_vistas(objs, nome, pasta):
    """Janela em vermelho, vidro deitado em verde (cores do atlas, só para conferir a classificação)."""
    ij, iv = mb.MAT_NOMES.index("janela"), mb.MAT_NOMES.index("vidro")
    for o in objs:
        me = o.data
        uv = me.uv_layers["UVMap"].data
        for p in me.polygons:
            if p.material_index in (ij, iv):
                uu = mb.uv_cor("vermelho" if p.material_index == ij else "verde_lima")
                for li in p.loop_indices:
                    uv[li].uv = uu
                p.material_index = 0
    it = mb.Item("dbg")
    it.add(*objs)
    corpo = it.monta()
    for k, d in {"frente": (0.35, -1.0, 0.35), "tras": (-0.35, 1.0, 0.35)}.items():
        mb.miniatura(corpo, os.path.join(pasta, f"dbg_{nome}_{k}.webp"), res=520, direcao=d)


def gera(saida, sel, debug=False):
    catalogos = {}
    for id_, rot, fbx, cat, grupo, tags, estilo, giro in PECAS:
        if sel and id_ not in sel:
            continue
        mb.limpa()
        for m in list(bpy.data.materials):  # materiais órfãos do FBX anterior ("Color.001"...)
            if m.name not in mb.MAT_NOMES and not m.name.startswith(("estampa_", "dbg_")) and m.users == 0:
                bpy.data.materials.remove(m)
        objs = importa_predio(fbx)
        esc, lote = enquadra(objs, giro)
        lo, hi = mb.bbox(objs)
        alt = hi.z - lo.z
        if cat == "auto":
            cat = "arranha_ceus" if alt >= 60.0 else "predios_regulares"
        fatia_vidros(objs, **FATIAS.get(id_, {"andar": 3.3}))
        if debug:
            debug_vistas(objs, id_, os.path.join(os.path.dirname(saida.rstrip("/")), "predios_pacote_sonda"))
            continue
        n_j = sorteia_janelas(objs, id_)
        niveis = andares_de(objs)
        andares = ANDARES.get(id_, len(niveis))
        print("predio", id_, cat, "escala", round(esc, 3), "dims", [round(hi.x - lo.x, 2), round(hi.y - lo.y, 2),
              round(alt, 2)], "lote", lote, "andares", andares, [round(z, 1) for z in niveis], "janelas", n_j,
              flush=True)
        it = mb.Item(id_)
        it.add(*objs)
        it.colisao(colisao_faixas(objs, COLISAO_FAIXAS.get(id_, 4)))
        if cat not in catalogos:
            catalogos[cat] = mb.Catalogo(cat, saida)
        catalogos[cat].exporta(it, rot, grupo=grupo, tags=tags, pacote=True,
                               extra={"lote": lote, "andares": andares, "estilo": estilo})
    for c in catalogos.values():
        c.salva()


# a torre torcida tem faixas de vidro de ~4,5 m sem caixilho: duas fileiras por faixa e colunas de 2 m para ler como
# janelas, e não como painéis inteiros acesos
# andares contados pelas cotas das janelas, salvo onde o fatiamento em meias faixas engana a contagem (vidro até ~39 m)
ANDARES = {"torre_torcida_fitas_pacote": 12}
FATIAS = {"torre_torcida_fitas_pacote": {"andar": 2.3, "larg": 2.0, "area_max": 6.0}}
COLISAO_FAIXAS = {"predio_eco_grade_verde_pacote": 3, "torre_eco_rampa_jardim_pacote": 5,
                  "predio_eco_terracos_pacote": 3, "torre_torcida_fitas_pacote": 4}

# vitrines de conferência: as peças do pacote junto com prédios nossos da mesma categoria, de dia e de noite
VITRINES = {
    "predios_ecologicos": ["predio_eco_grade_verde_pacote", "torre_eco_rampa_jardim_pacote", "predio_eco_terracos_pacote",
                           "torre_degraus_inclinada", "predio_trelica_verde", "torre_lajes_arredondadas",
                           "escritorio_jardim_telhado"],
    "predios_regulares": ["torre_torcida_fitas_pacote", "torre_faixas_vermelhas", "torre_curva_empresarial",
                          "escritorio_moldura_oval", "hotel"],
}


def vitrines(saida, modos, cats=None):
    for cat, ids in VITRINES.items():
        if cats and cat not in cats:
            continue
        pasta = os.path.join(saida, cat)
        for m in modos:
            arq = os.path.join(pasta, f"vitrine_pacote{'_noite' if m == 'noite' else ''}.png")
            mb.vitrine(pasta, arq, ids=ids, colunas=len(ids), res=(2000, 900), noite=(m == "noite"))


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    if "vitrine" in args[1:]:
        vitrines(args[0], [a for a in args[1:] if a in ("dia", "noite")] or ["dia", "noite"],
                 [a for a in args[1:] if a in VITRINES])
    else:
        resto = [a for a in args[1:] if a != "debug"]
        gera(args[0], resto, debug="debug" in args[1:])
