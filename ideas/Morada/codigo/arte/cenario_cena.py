"""Montagem e render de cenas de teste da categoria "cenario" (encaixe e teste de cena, de dia e de noite).

Uso:
  MOVEIS_THREADS=1 blender-venv/bin/python -I morada-art/cenario_cena.py -- SP/cidade_out <cena> [dia|noite|ambos]
Cenas: encaixe_costa, encaixe_plato, encaixe_montanhas, encaixe_represa, teste_cena.
Grava em SP/cidade_out/cenario/<cena>_<dia|noite>.png.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import moveis_base as mb  # noqa: E402

V = Vector
SAIDA = ""
_CACHE = {}


def peca(cat, id_, p, r=0.0, s=1.0):
    """Instancia a peça (importa o GLB uma vez; as outras são cópias ligadas)."""
    chave = (cat, id_)
    if chave not in _CACHE:
        arq = os.path.join(SAIDA, cat, "glb", id_ + ".glb")
        antes = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=arq)
        novos = [o for o in bpy.data.objects if o not in antes]
        for o in novos:
            if o.get("colisao"):
                o.hide_render = True
        raiz = [o for o in novos if o.parent is None][0]
        col = bpy.data.collections.new(f"{cat}:{id_}")
        for o in novos:
            for c in o.users_collection:
                c.objects.unlink(o)
            col.objects.link(o)
        raiz.location = (0, 0, 0)
        _CACHE[chave] = col
    col = _CACHE[chave]
    inst = bpy.data.objects.new(f"{id_}", None)
    inst.instance_type = "COLLECTION"
    inst.instance_collection = col
    inst.location = p
    inst.rotation_euler = (0, 0, math.radians(r))
    inst.scale = (s, s, s)
    bpy.context.scene.collection.objects.link(inst)
    return inst


def render(arq, alvo, pos, ortho=None, noite=False, res=(1600, 1000), amostras=40, lente=40):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = int(os.environ.get("AMOSTRAS", amostras))
    scn.cycles.use_denoising = True
    scn.render.threads_mode = "FIXED"
    scn.render.threads = int(os.environ.get("MOVEIS_THREADS", "1"))
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.get("ceu") or bpy.data.worlds.new("ceu")
    scn.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*mb._lin("#141E36" if noite else "#A9C8EE"), 1)
    bg.inputs[1].default_value = 0.35 if noite else 0.85
    mb.emissao_janelas(mb.JANELA_FORCA * 1.4 if noite else 0.0)
    for nome in ("sol_cena",):
        if nome in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[nome])
    ld = bpy.data.lights.new("sol_cena", "SUN")
    ld.energy = 0.35 if noite else 3.2
    ld.color = (0.55, 0.65, 1.0) if noite else (1.0, 0.97, 0.92)
    ld.angle = math.radians(5)
    sol = bpy.data.objects.new("sol_cena", ld)
    scn.collection.objects.link(sol)
    sol.rotation_euler = (math.radians(45), 0, math.radians(-40))
    cam = bpy.data.objects.get("cam_cena")
    if cam is None:
        cam = bpy.data.objects.new("cam_cena", bpy.data.cameras.new("cam_cena"))
        scn.collection.objects.link(cam)
    scn.camera = cam
    cam.location = pos
    cam.rotation_euler = (V(alvo) - V(pos)).to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = "PERSP"
        cam.data.lens = lente
    cam.data.clip_end = 5000
    scn.render.image_settings.file_format = "PNG"
    scn.render.filepath = arq
    bpy.ops.render.render(write_still=True)
    print("render", arq, flush=True)


# ---------------------------------------------------------------------------------------------------- cenas
def encaixe_costa():
    """Ilhota 4 × 4: grama no meio, transições, costa de areia nos quatro lados com cantos, faixa e ponta, mar."""
    C = "cenario"
    Q = 15.0
    # terra: grama 2 × 1 no meio
    for x in (0, 15):
        peca("pisos", "piso_grama", (x, 0, 0))
    peca(C, "grama_areia_reta", (0, 15, 0), 0)
    peca(C, "grama_areia_reta", (15, 15, 0), 0)
    peca(C, "grama_areia_reta", (0, -15, 0), 180)
    peca(C, "grama_areia_reta", (15, -15, 0), 180)
    peca(C, "grama_areia_canto_ext", (30, 15, 0), 0)
    peca(C, "grama_areia_canto_ext", (-15, -15, 0), 180)
    peca(C, "grama_areia_reta", (30, 0, 0), -90)
    peca(C, "grama_areia_reta", (-15, 0, 0), 90)
    peca(C, "grama_areia_canto_ext", (-15, 15, 0), 90)
    peca(C, "grama_areia_canto_ext", (30, -15, 0), -90)
    # costa em volta (mar para fora)
    for x in (-15, 0, 15, 30):
        peca(C, "costa_areia_reta", (x, 30, 0), 0)
        peca(C, "costa_areia_reta", (x, -30, 0), 180)
    for y in (-15, 0, 15):
        peca(C, "costa_areia_reta", (45, y, 0), -90)
        peca(C, "costa_areia_reta", (-30, y, 0), 90)
    peca(C, "costa_areia_canto_ext", (45, 30, 0), 0)
    peca(C, "costa_areia_canto_ext", (-30, -30, 0), 180)
    peca(C, "costa_areia_canto_ext", (-30, 30, 0), 90)
    peca(C, "costa_areia_canto_ext", (45, -30, 0), -90)
    # faixa e ponta saindo pelo norte de x = 0 — troca a reta por um canto interno de cada lado
    # mar em volta
    for x in range(-60, 76, 15):
        for y in range(-60, 61, 15):
            if -30 <= x <= 45 and -30 <= y <= 30:
                continue
            peca(C, "mar", (x, y, 0))
    return dict(alvo=(7.5, 0, 0), pos=(7.5 + 70, -110, 95))


def encaixe_ponta():
    """Península estreita: costa reta, começo da faixa, faixa, ponta; costa de rocha com canto; areia; mar."""
    C = "cenario"
    for x in (-15, 0, 15, 30):
        peca("pisos", "piso_grama", (x, -15, 0))
    peca(C, "costa_areia_reta", (-15, 0, 0))
    peca(C, "costa_areia_faixa_base", (0, 0, 0))
    peca(C, "costa_areia_reta", (15, 0, 0))
    peca(C, "costa_areia_canto_ext", (30, 0, 0))
    peca(C, "costa_areia_faixa", (0, 15, 0))
    peca(C, "costa_areia_ponta", (0, 30, 0))
    peca(C, "costa_rocha_reta", (-30, -15, 0), 90)
    peca(C, "costa_rocha_canto_ext", (-30, 0, 0), 90)
    peca(C, "costa_rocha_canto_int", (-30, -30, 0), 90) if False else None
    peca(C, "grama_areia_reta", (-15, -30, 0), 180) if False else None
    for x, y in ((-30, 15), (-15, 15), (15, 15), (30, 15), (-30, 30), (-15, 30), (15, 30), (30, 30),
                 (-15, 45), (0, 45), (15, 45), (-45, 0), (-45, -15), (-45, 15), (45, 0), (45, 15), (45, -15)):
        peca(C, "mar", (x, y, 0))
    peca(C, "costa_areia_reta", (45, -15, 0), -90) if False else None
    return dict(alvo=(0, 10, 0), pos=(45, -60, 55))


def encaixe_plato():
    C = "cenario"
    peca("ruas", "rua_reta", (0, -15, 0))
    peca(C, "plato_rampa_rua", (0, 0, 0))
    peca("ruas", "rua_cruzamento_t", (0, 15, 3.75), 0)
    peca(C, "plato_borda", (-15, 0, 0))
    peca(C, "plato_borda", (15, 0, 0))
    peca(C, "plato_canto_ext", (30, 0, 0))
    peca(C, "plato_borda", (30, 15, 0), -90)
    peca(C, "plato_canto_int", (-30, 0, 0)) if False else None
    peca(C, "plato_borda", (-30, 0, 0))
    peca(C, "plato_topo", (-15, 15, 0))
    peca(C, "plato_topo", (15, 15, 0))
    peca(C, "plato_topo", (-30, 15, 0))
    for x in (-30, -15, 15, 30):
        peca("pisos", "piso_grama", (x, -15, 0))
    return dict(alvo=(0, 0, 2), pos=(45, -60, 40))


def teste_cena():
    """Pedaço de ilha: montanhas com o túnel no fim da rua, observatório, rua com prédios-marco, praia com píer e navio,
    costa de rocha com farol e o mar."""
    C = "cenario"
    peca(C, "montanha_tunel", (0, 37.5, 0))
    peca(C, "montanha_grande", (-52.5, 52.5, 0))
    peca(C, "montanha_media", (45, 45, 0))
    peca(C, "montanha_pequena", (0, 67.5, 0))
    peca(C, "morro_verde", (97.5, 37.5, 0)) if False else None
    peca(C, "observatorio", (-45, 7.5, 0))
    # rua N-S até o túnel e rua E-W na beira da praia
    peca("ruas", "rua_reta", (0, 15, 0))
    peca("ruas", "rua_reta_faixa_pedestres", (0, 0, 0))
    peca("ruas", "rua_cruzamento_t", (0, -15, 0), 180)
    for x in (-60, -45, -30, -15, 15, 30, 45, 60):
        peca("ruas", "rua_reta", (x, -15, 0), 90)
    peca("ruas", "rua_fim", (-75, -15, 0), 90)
    peca("ruas", "rua_fim", (75, -15, 0), -90)
    # lotes ao norte da rua E-W (lado leste) e grama
    peca("pisos", "piso_calcada_lisa", (15, 0, 0))
    peca("pisos", "piso_calcada_lisa", (30, 0, 0))
    peca("pisos", "piso_calcada_lisa", (45, 0, 0))
    peca("pisos", "piso_calcada_lisa", (60, 0, 0))
    peca(C, "lanchonete_24h", (15, 0, 0))
    peca(C, "predio_aquario", (30, 0, 0))
    peca(C, "hospital", (52.5, 0, 0))
    for x in (15, 30, 45, 60):
        peca("pisos", "piso_grama", (x, 15, 0))
    peca("pisos", "piso_grama", (-15, 0, 0))
    peca("pisos", "piso_grama", (-15, 15, 0))
    peca("pisos", "piso_grama", (75, 0, 0))
    peca("pisos", "piso_grama", (75, 15, 0))
    for x, y in ((18, 15), (27, 18), (40, 14), (55, 17), (66, 12), (-14, 4), (-17, 17), (74, 6), (78, 18)):
        peca("vegetacao", "arvore_redonda_media", (x, y, 0), x * 7)
    # praia, píer e mar
    for x in range(-75, 61, 15):
        if x in (0, 15):
            continue
        peca(C, "areia", (x, -30, 0))
    peca(C, "areia", (0, -30, 0))
    peca(C, "areia", (15, -30, 0))
    for x in range(-75, 46, 15):
        if x in (0, 15):
            peca(C, "pier_cruzeiro_acesso_areia", (x, -45, 0), 180)
        else:
            peca(C, "costa_areia_reta", (x, -45, 0), 180)
    peca(C, "costa_rocha_reta", (60, -45, 0), 180)
    peca(C, "costa_rocha_canto_ext", (75, -45, 0), -90)
    peca(C, "costa_rocha_reta", (75, -30, 0), -90)
    peca(C, "farol", (66, -32, 0), 30)
    peca(C, "pier_cruzeiro", (7.5, -75, 0), 180)
    peca(C, "pier_cruzeiro_ponta", (7.5, -105, 0), 180)
    peca("barcos", "navio_cruzeiro", (-15.6, -84, -1.0), 180)
    peca("barcos", "veleiro_vela_vermelha", (55, -78, -1.0), 40)
    peca("barcos", "lancha_vermelha", (-55, -70, -1.0), -60)
    for x in range(-75, 91, 15):
        for y in range(-120, -59, 15):
            if -7.5 < x < 22.5 and -112.5 < y < -52.5:
                continue
            peca(C, "mar", (x, y, 0))
    for y in (-45, -30):
        peca(C, "mar", (90, y, 0))
    peca(C, "mar", (90, -15, 0)) if False else None
    for x, y in ((-62, -30), (-38, -33), (-20, -28), (28, -31), (42, -27), (52, -33)):
        peca("vegetacao", "palmeira", (x, y, 0), x * 11)
    return dict(alvo=(5, -25, 4), pos=(120, -215, 135), lente=32, res=(1800, 1100))


def encaixe_represa():
    """Represa grande montada (4 trechos + 2 torres, pela montagem do catálogo), com o reservatório atrás."""
    import json as _j
    cat = _j.load(open(os.path.join(SAIDA, "cenario", "catalogo.json")))
    it = [i for i in cat["itens"] if i["id"] == "represa_grande_trecho"][0]
    for m in it["montagem"]:
        peca("cenario", m["i"], tuple(m["p"]), m["r"])
    for x in range(-150, 151, 60):
        peca("cenario", "mar_grande", (x, 60, 38.0)) if False else None
    for x in range(-150, 151, 15):
        for y in range(-75, -14, 15):
            peca("pisos", "piso_grama", (x, y, 0))
    return dict(alvo=(0, -20, 15), pos=(110, -260, 150), lente=30)


def encaixe_montanhas():
    """Cordilheira: blocos de montanha encostados, morro verde e a montanha do túnel com a rua."""
    C = "cenario"
    peca(C, "montanha_enorme", (-60, 45, 0))
    peca(C, "montanha_grande", (22.5, 52.5, 0))
    peca(C, "montanha_crista", (82.5, 37.5, 0))
    peca(C, "montanha_media", (75, 0, 0)) if False else None
    peca(C, "montanha_tunel", (0, 7.5, 0))
    peca(C, "montanha_pequena", (-37.5, -15, 0)) if False else None
    peca(C, "morro_verde", (52.5, 7.5, 0))
    peca(C, "montanha_media", (-60, -15, 0)) if False else None
    for x in range(-15, 16, 15):
        pass
    peca("ruas", "rua_reta", (0, -15, 0))
    peca("ruas", "rua_reta", (0, -30, 0))
    for x in range(-105, 106, 15):
        for y in (-15, -30):
            if x == 0:
                continue
            peca("pisos", "piso_grama", (x, y, 0))
    for x in (-37.5 + 7.5, -15):
        pass
    for x in range(-105, -15, 15):
        peca("pisos", "piso_grama", (x, 0, 0)) if False else None
    return dict(alvo=(0, 20, 12), pos=(70, -170, 95), lente=30)


def monta(nome):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mb.materiais()
    return globals()[nome]()


def main():
    global SAIDA
    argv = sys.argv[sys.argv.index("--") + 1:]
    SAIDA = argv[0]
    nome = argv[1]
    modo = argv[2] if len(argv) > 2 else "ambos"
    cam = monta(nome)
    pasta = os.path.join(SAIDA, "cenario")
    for noite in ((False, True) if modo == "ambos" else ((modo == "noite"),)):
        arq = os.path.join(pasta, f"{nome}_{'noite' if noite else 'dia'}.png")
        render(arq, cam["alvo"], cam["pos"], ortho=cam.get("ortho"), noite=noite, res=cam.get("res", (1600, 1000)),
               lente=cam.get("lente", 40))


if __name__ == "__main__":
    main()
