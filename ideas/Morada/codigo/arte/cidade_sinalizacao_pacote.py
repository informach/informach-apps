"""Cidade do Morada: peças do pacote gratuito Cartoon City nas categorias "sinalizacao" e "grafites".

Uso:
  MOVEIS_THREADS=1 CIDADE_PACOTE_FBX=SP/ideias/Cartoon_City/Cartoon_City_Free_fbx/Separate_assets_fbx \\
    blender-venv/bin/python -I morada-art/cidade_sinalizacao_pacote.py -- SP/cidade_out [ids...]

Peças (pacote=True, uso interno, não distribuir), acrescentadas ao catalogo.json existente sem apagar as outras:
  sinalizacao: outdoor_esquina_2x1_03_pacote, outdoor_esquina_2x1_05_pacote (painel que dobra a esquina do prédio,
               origem na quina como os painéis de esquina da categoria), faixa_4x1_03_pacote, faixa_4x1_04_pacote
               (faixa de fachada com o letreiro que corre por cima) e bandeirola_setas_pacote (placa de braço com
               setas em V);
  grafites:    grafite_03_pacote (decalque transparente, MASK).
Convenções do GUIA_SINALIZACAO: fixacao "parede" (costas em y = 0, frente para −Y, origem no meio da largura e na
base), altura_instalacao sugerida, telas com mb.material_estampa(..., emissao=...) (brilham à noite), placas de parede
sem colisão. As texturas do pacote (Banners.png, scrolling text.png, Graffiti.png) são recortadas no trecho que cada
peça usa (o UV é remapeado para 0..1), para o GLB não levar o atlas inteiro de 4096².
Animação: o letreiro das faixas 4×1 é um filho "letreiro_rolante" com extras glTF {"anima": "rolar",
"velocidade": 0.06}: a textura (um período da frase, que emenda na ponta) corre em U; o mesmo vai no catálogo em
extra["animacoes"] = [{"nome", "anima", "velocidade", "pivo"}].
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from PIL import Image  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
FBX = os.environ.get("CIDADE_PACOTE_FBX", "")
MINI_FRENTE = (0.22, -1.0, 0.16)


class ItemP(mb.Item):
    """Item com filhos animados (extras glTF no nó filho)."""

    def __init__(self, id_):
        super().__init__(id_)
        self.animados = []

    def anima(self, ob, dados, nome, pivo=None):
        ob.name = nome
        if pivo is None:
            lo, hi = mb.bbox(ob)
            pivo = (lo + hi) / 2
        d = V(pivo)
        ob.data.transform(Matrix.Translation(-d))
        ob.location = d
        self.animados.append((ob, dict(dados)))
        return ob

    def monta(self):
        corpo = super().monta()
        for ob, d in self.animados:
            ob.parent = corpo
            for k, v in d.items():
                ob[k] = v
        bpy.context.view_layer.update()
        return corpo

    def lista_animacoes(self):
        return [dict(nome=ob.name, **d, pivo=mb._gl(ob.location)) for ob, d in self.animados]


def recorta(png, u0, u1, v0, v1, destino):
    """Recorta o trecho (u0..u1, v0..v1) do PNG do pacote e grava em destino (o UV do Blender tem v para cima)."""
    im = Image.open(png)
    W, H = im.size
    caixa = (int(round(u0 * W)), int(round((1 - v1) * H)), int(round(u1 * W)), int(round((1 - v0) * H)))
    im.crop(caixa).save(destino)
    return destino


def material_alfa(chave, png, emissao=0.0):
    """Como mb.material_estampa, mas com o alfa da textura ligado (corte em 0,5 → alphaMode MASK no glTF)."""
    if chave not in mb.MAT_NOMES:
        m, b = mb._principled(chave)
        nt = m.node_tree
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = bpy.data.images.load(png, check_existing=True)
        tx.image.alpha_mode = "STRAIGHT"
        tx.image.pack()
        nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
        corte = nt.nodes.new("ShaderNodeMath")
        corte.operation = "ROUND"
        nt.links.new(tx.outputs["Alpha"], corte.inputs[0])
        nt.links.new(corte.outputs["Value"], b.inputs["Alpha"])
        b.inputs["Roughness"].default_value = 0.6
        if emissao:
            nt.links.new(tx.outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = emissao
        m.surface_render_method = "DITHERED"
        mb.MAT_NOMES.append(chave)
    return mb.MAT_NOMES.index(chave)


def importa(nome, pasta_tex, regras):
    """Importa <nome>.fbx: as faces de cor viram a nossa paleta (amostrando Textures1.png); as de material com
    textura própria seguem 'regras' {nome_do_material: função(png_recortado) -> índice de material} com o UV
    remapeado para o recorte. Devolve {nome_do_objeto: objeto} já em metros, Z para cima."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(FBX, nome + ".fbx"))
    novos = [o for o in bpy.data.objects if o not in antes]
    mb.materiais()
    atlas = bpy.data.images.load(os.path.join(FBX, "Textures1.png"), check_existing=True)
    W, H = atlas.size
    px = atlas.pixels[:]
    cache = {}
    out = {}
    for o in novos:
        if o.type != "MESH":
            continue
        me = o.data.copy()
        me.transform(o.matrix_world)
        mats = [m.name.lower().split(".")[0] if m else "" for m in me.materials]
        bm = bmesh.new()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        uvl = bm.loops.layers.uv.active
        # recorte por material com textura própria
        limites = {}
        for f in bm.faces:
            nm = mats[f.material_index] if f.material_index < len(mats) else ""
            if nm in regras:
                us = [lo[uvl].uv for lo in f.loops]
                a = limites.setdefault(nm, [1e9, -1e9, 1e9, -1e9])
                a[0] = min(a[0], *(q[0] for q in us))
                a[1] = max(a[1], *(q[0] for q in us))
                a[2] = min(a[2], *(q[1] for q in us))
                a[3] = max(a[3], *(q[1] for q in us))
        mat_regra = {}
        for nm, (u0, u1, v0, v1) in limites.items():
            fonte, func = regras[nm]
            png = recorta(os.path.join(FBX, fonte), u0, u1, v0, v1,
                          os.path.join(pasta_tex, f"pacote_{nome.lower()}_{nm.replace(' ', '_')}.png"))
            mat_regra[nm] = (func(png, (u0, u1, v0, v1)) if getattr(func, "com_limites", False) else func(png),
                             (u0, u1, v0, v1))
        for f in bm.faces:
            nm = mats[f.material_index] if f.material_index < len(mats) else ""
            if nm in mat_regra:
                mi, (u0, u1, v0, v1) = mat_regra[nm]
                for lo in f.loops:
                    u, v = lo[uvl].uv
                    lo[uvl].uv = ((u - u0) / max(1e-6, u1 - u0), (v - v0) / max(1e-6, v1 - v0))
                f.material_index = mi
                continue
            if "glass" in nm:
                f.material_index = mb.MAT_NOMES.index(regras.get("_glass", "vidro"))
                continue
            if "emissive" in nm:
                f.material_index = mb.MAT_NOMES.index(regras.get("_emissive", "luz"))
                continue
            us = [lo[uvl].uv for lo in f.loops]
            u = sum(q[0] for q in us) / len(us)
            v = sum(q[1] for q in us) / len(us)
            k = (min(H - 1, max(0, int(v % 1 * H))) * W + min(W - 1, max(0, int(u % 1 * W)))) * 4
            rgb = tuple(round(c, 3) for c in px[k:k + 3])
            if rgb not in cache:
                cache[rgb] = mb.cor_mais_proxima(rgb)
            uu = mb.uv_cor(cache[rgb])
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
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(40))
        ob = bpy.data.objects.new(o.name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        out[o.name] = ob
    for o in novos:
        bpy.data.objects.remove(o)
    return out


ESCALA_U = {}


def letreiro_emendado(nome):
    """O pacote mostra só um trecho (u0..u1) de uma linha do 'scrolling text.png' em que a frase se repete. Para a
    textura correr em U e emendar, recorta exatamente um período da frase (achado por autocorrelação do alfa das
    colunas) a partir de u0; o UV do letreiro é reescalado depois (ESCALA_U)."""
    import numpy as np

    def f(png, lim):
        u0, u1, v0, v1 = lim
        im = Image.open(os.path.join(FBX, "scrolling text.png")).convert("RGBA")
        W, H = im.size
        a = np.asarray(im)[int(round((1 - v1) * H)):int(round((1 - v0) * H)), :, 3].astype(float)
        col = (a.max(axis=0) > 40).astype(float)
        c0 = int(round(u0 * W))
        lo_, hi_ = int(0.15 * W), int(0.6 * W)
        x = col - col.mean()
        melhores = [(float(np.dot(x[:W - k], x[k:])), k) for k in range(lo_, hi_)]
        per = max(melhores)[1]
        faixa = im.crop((c0, int(round((1 - v1) * H)), c0 + per, int(round((1 - v0) * H))))
        faixa.save(png)
        ESCALA_U[nome] = (u1 - u0) * W / per
        return material_alfa("estampa_pacote_letreiro_" + nome.lower(), png, emissao=2.0)
    f.com_limites = True
    return f


def tela(chave, emissao=1.0):
    return lambda png: mb.material_estampa(chave, png, emissao=emissao)


# ======================================================================================================================
def p_outdoor_esquina(it, nome, tex):
    pc = importa(nome, tex, {"billboard": ("Banners.png", tela("pacote_" + nome.lower(), 1.0))})
    it.add(*pc.values())


def p_faixa_rolante(it, nome, tex):
    pc = importa(nome, tex, {"billboard": ("Banners.png", tela("pacote_" + nome.lower(), 1.0)),
                             "scrolling text": ("scrolling text.png", letreiro_emendado(nome))})
    linha = pc.pop(nome + "_Line")
    uv = linha.data.uv_layers["UVMap"].data
    k = ESCALA_U.get(nome, 1.0)
    for d in uv:
        d.uv = (d.uv[0] * k, d.uv[1])
    it.add(*pc.values())
    it.anima(linha, {"anima": "rolar", "velocidade": 0.06}, "letreiro_rolante")


def p_bandeirola(it, nome, tex):
    pc = importa(nome, tex, {"_glass": "brilho_roxo", "_emissive": "neon"})
    for o in pc.values():  # o pacote pendura a placa num braço preso no plano x = 0: gira para a parede ficar em y = 0
        o.data.transform(Matrix.Rotation(math.radians(90), 4, "Z"))
    lo, hi = mb.bbox(list(pc.values()))
    for o in pc.values():
        o.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -hi.y, -lo.z)))
    it.add(*pc.values())


def p_grafite(it, nome, tex):
    pc = importa(nome, tex, {"graffiti": ("Graffiti.png",
                                          lambda png: material_alfa("estampa_grafite_pacote_03", png))})
    lo, hi = mb.bbox(list(pc.values()))
    for o in pc.values():
        o.data.transform(Matrix.Translation((0, -0.002 - hi.y, -lo.z)))
    it.add(*pc.values())


PECAS = [
    # (categoria, id, rótulo, grupo, função, fbx, altura_instalacao, tags, extra, miniatura)
    ("sinalizacao", "outdoor_esquina_2x1_03_pacote", "Painel de esquina com videogame (pacote)",
     "pacote_outdoor_esquina", p_outdoor_esquina, "Billboard_2x1_03", 6.0, ["painel", "fachada", "esquina", "pacote"],
     {"quina": [0.0, 0.0, 0.0]}, (0.9, -1.0, 0.3)),
    ("sinalizacao", "outdoor_esquina_2x1_05_pacote", "Painel de esquina do parque (pacote)",
     "pacote_outdoor_esquina", p_outdoor_esquina, "Billboard_2x1_05", 6.0, ["painel", "fachada", "esquina", "pacote"],
     {"quina": [0.0, 0.0, 0.0]}, (0.9, -1.0, 0.3)),
    ("sinalizacao", "faixa_4x1_03_pacote", "Faixa de fachada com montanhas e letreiro correndo (pacote)",
     "pacote_faixa_letreiro", p_faixa_rolante, "Billboard_4x1_03", 4.5,
     ["faixa", "fachada", "led", "animado", "pacote"], None, MINI_FRENTE),
    ("sinalizacao", "faixa_4x1_04_pacote", "Faixa de fachada clara com letreiro correndo (pacote)",
     "pacote_faixa_letreiro", p_faixa_rolante, "Billboard_4x1_04", 4.5,
     ["faixa", "fachada", "led", "animado", "pacote"], None, MINI_FRENTE),
    ("sinalizacao", "bandeirola_setas_pacote", "Placa de braço com setas em V (pacote)", "pacote_bandeirola",
     p_bandeirola, "Signboard_01", 3.5, ["placa", "bandeira", "fachada", "neon", "pacote"], None, (1.0, -0.3, 0.15)),
    ("grafites", "grafite_03_pacote", "Grafite amarelo e verde (pacote)", "pacote_grafite", p_grafite, "Graffiti_03",
     0.4, ["decalque", "grafite", "pacote"], None, (0.12, -1.0, 0.08)),
]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    saida, filtro = argv[0], argv[1:]
    assert FBX, "defina CIDADE_PACOTE_FBX"
    cats = {}
    for cat_nome, id_, rotulo, grupo, f, fbx, alt, tags, extra, mini in PECAS:
        if filtro and id_ not in filtro and cat_nome not in filtro:
            continue
        if cat_nome not in cats:
            cats[cat_nome] = mb.Catalogo(cat_nome, saida, rotulo={"sinalizacao": "Sinalização",
                                                                  "grafites": "Grafites"}[cat_nome])
            antes = len(cats[cat_nome].dados["itens"])
            print("catalogo", cat_nome, "tinha", antes, "itens", flush=True)
        cat = cats[cat_nome]
        tex = os.path.join(saida, cat_nome, "estampas")
        os.makedirs(tex, exist_ok=True)
        mb.limpa()
        it = ItemP(id_)
        f(it, fbx, tex)
        ex = dict(extra or {})
        anims = it.lista_animacoes()
        if anims:
            ex["animacoes"] = anims
        e = cat.exporta(it, rotulo, grupo=grupo, fixacao="parede", altura_instalacao=alt, pacote=True, tags=tags,
                        miniatura_dir=mini, extra=ex or None)
        e["colisao"] = []  # peças de parede não colidem (como as placas de parede da categoria)
        if cat_nome == "sinalizacao":
            e["tags"] = sorted(set(e["tags"]) | {"sinalizacao"})
        cat.salva()
    for nome, cat in cats.items():
        print("catalogo", nome, "agora tem", len(cat.dados["itens"]), "itens", flush=True)


if __name__ == "__main__":
    main()
