"""Bichos do zoológico do Morada (grupo `zoologico` da biblioteca de personagens).

Cada bicho nasce de um bicho do pacote grátis Animals (Tiger ou Deer; uso interno, não distribuir), deformado por osso
com as contas do bichos.py (cada vértice vai com os ossos que o puxam), com peças novas (tromba com ossos próprios,
presas, orelhas grandes, juba, chifres, ossicones, crina, boca por dentro, dentes, escamas) e cores por vértice.
As animações do pacote passam para 24 qps na escala do bicho; as outras são compostas por poses-chave
(bichos_zoologico_especies.py), assentadas no chão em cada chave.

Uso:
  python -I bichos_zoologico.py -- <saida> [ids|todos]
  python -I bichos_zoologico.py -- lab <id> <pasta> [animacoes]   (esboços das poses-chave, sem exportar)
Saída: <saida>/glb/<id>.glb e <saida>/zoologico.json (as folhas e miniaturas saem do bichos_zoologico_render.py,
que importa os GLB como o jogo os vê).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import bichos_zoologico_base as ZB  # noqa: E402
import bichos_zoologico_anim as ZA  # noqa: E402
import bichos_zoologico_especies as ZE  # noqa: E402


def constroi(id_, bases):
    sp = ZE.especie(id_)
    nome_base = sp["base"]
    if nome_base not in bases:
        bases.clear()
        bases[nome_base] = ZB.BasePacote(nome_base)
    base = bases[nome_base]
    return ZE.faz(base, id_, sp), base, sp


def anims_de(bi, sp, id_):
    """Lista de animações: ('pacote', chave, id, rótulo, laço, tempo) ou dict composta."""
    return ZE.animacoes(bi, sp, id_)


def lab(id_, pasta, quais):
    os.makedirs(pasta, exist_ok=True)
    bases = {}
    bi, base, sp = constroi(id_, bases)
    rot, loc = bi.neutro()
    r0 = [np.array([np.eye(3)] * len(bi.nomes)), np.zeros((len(bi.nomes), 3))]
    ZA.esboco(bi, [tuple(r0), (rot, loc)], os.path.join(pasta, f"{id_}_descanso.png"), "lado", 420, ["descanso", "neutra"])
    ZA.esboco(bi, [tuple(r0), (rot, loc)], os.path.join(pasta, f"{id_}_descanso_tq.png"), "tq", 420, ["descanso", "neutra"])
    _, K = bi.fk(*r0)
    P = bi.pele(K)
    print("dim", id_, np.round(P.max(0) - P.min(0), 2), "zmin", round(P[:, 2].min(), 3), "tris",
          sum(len(f) - 2 for i, f in enumerate(bi.F) if not bi.tirar[i]))
    for an in anims_de(bi, sp, id_):
        if isinstance(an, tuple) or (quais and an["id"] not in quais):
            continue
        poses = [ZA.resolve_chave(bi, s, o) for _, s, o in an["chaves"]]
        rot_ = [f"{t:.1f}s" for t, _, _ in an["chaves"]]
        for vista in an.get("vistas", ["lado"]):
            ZA.esboco(bi, poses, os.path.join(pasta, f"{id_}_{an['id']}_{vista}.png"), vista, 300, rot_)
        print("anim", an["id"], len(poses), "chaves")


def main():
    a = sys.argv[sys.argv.index("--") + 1:]
    if a[0] == "lab":
        lab(a[1], a[2], a[3].split(",") if len(a) > 3 else None)
        return
    saida = a[0]
    ids = list(ZE.ESPECIES) if len(a) < 2 or a[1] == "todos" else a[1].split(",")
    os.makedirs(os.path.join(saida, "glb"), exist_ok=True)
    cat_path = os.path.join(saida, "zoologico.json")
    cat = json.load(open(cat_path)) if os.path.exists(cat_path) else {"grupo": "zoologico", "uso": ZB.SELO, "bichos": []}
    por_id = {b["id"]: b for b in cat["bichos"]}
    bases = {}
    relatorio = {}
    # agrupa por base (carregar o FBX zera a cena: os da mesma base vão juntos)
    ids.sort(key=lambda i: ZE.especie(i)["base"])
    for id_ in ids:
        bi, base, sp = constroi(id_, bases)
        arm, ob = ZB.objeto(base, bi, id_)
        lista = []
        conf = {}
        for an in anims_de(bi, sp, id_):
            if isinstance(an, tuple):
                _, chave, aid, rotulo, laco, tempo, extra = an
                act = ZA.acao_pacote(bi, arm, base.acoes[chave], id_, aid, tempo, extra)
            else:
                aid, rotulo, laco = an["id"], an["rotulo"], an.get("laco", True)
                act, _ = ZA.acao_composta(bi, arm, id_, an)
                ZA.corrige_chao(bi, arm, act)
            zs, slip = ZA.confere(bi, act, 2, ZE.pes(bi) if aid in ZE.PARADOS else None)
            if isinstance(an, tuple) and (abs(np.median(zs)) > 0.004 or zs.min() < -0.004):
                # animação do pacote: a mediana do ponto mais baixo vai a 0 e nada atravessa o chão
                ZA.levanta_raiz(bi, arm, act, -float(np.median(zs)))
                zs, slip = ZA.confere(bi, act, 2, ZE.pes(bi) if aid in ZE.PARADOS else None)
            conf[aid] = dict(zmin=round(float(zs.min()), 3), zmed=round(float(np.median(zs)), 3), desliza=round(float(slip), 3))
            f0, f1 = act.frame_range
            lista.append(dict(id=aid, rotulo=rotulo, laco=bool(laco), segundos=round((f1 - f0) / ZB.FPS, 2)))
        caminho = os.path.join(saida, "glb", id_ + ".glb")
        ZB.exporta(arm, ob, caminho)
        _, K = bi.fk(np.array([np.eye(3)] * len(bi.nomes)), np.zeros((len(bi.nomes), 3)))
        P = bi.pele(K)
        dim = P.max(0) - P.min(0)
        tris = sum(len(f) - 2 for i, f in enumerate(bi.F) if not bi.tirar[i])
        por_id[id_] = dict(id=id_, nome=sp["nome"], especie=sp["especie"], grupo="zoologico", escala=sp.get("escala", 1.0),
                           pacote=True, base=sp["base"].replace("_001", ""), uso="interno, não distribuir",
                           altura_m=round(float(dim[2]), 2), comprimento_m=round(float(dim[1]), 2),
                           animacoes=lista)
        relatorio[id_] = dict(tris=tris, kb=os.path.getsize(caminho) // 1024, dim=[round(float(x), 2) for x in dim], conf=conf)
        print("bicho", id_, "tris", tris, "KB", os.path.getsize(caminho) // 1024, "dim", np.round(dim, 2), flush=True)
        for k, v in conf.items():
            print("   ", k, v, flush=True)
    ordem = list(ZE.ESPECIES)
    cat["bichos"] = sorted(por_id.values(), key=lambda b: ordem.index(b["id"]) if b["id"] in ordem else 99)
    json.dump(cat, open(cat_path, "w"), ensure_ascii=False, indent=1)
    json.dump(relatorio, open(os.path.join(saida, "_conferencia_" + "_".join(sorted(ids))[:60] + ".json"), "w"), indent=1)
    print("fim", len(ids))


if __name__ == "__main__":
    main()
