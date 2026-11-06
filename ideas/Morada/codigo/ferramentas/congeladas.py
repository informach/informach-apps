"""Animações aprovadas ficam congeladas: nenhuma correção ou reconstrução muda o que vai para o jogo e para a página.

Cada animação marcada como boa na página (banco do artefato, coleção "avaliacoes") tem uma cópia exata em
biblioteca/congeladas/<fonte>/<id>.blend, com a impressão digital das chaves (<id>.json, que guarda também os apoios
de cena e as correções daquela animação). <fonte> é a biblioteca: adulto, plus_f, adulta_gravida...

  sincroniza <avaliacoes.json>  congela as novas boas (a partir da biblioteca de trabalho atual), descongela as que
                                deixaram de ser boas e grava biblioteca/para_corrigir.json com as ruins.
                                As que já estavam congeladas não são tocadas.
  repoe <fonte>                 põe as congeladas de volta na biblioteca de trabalho (.blend e .json).
  confere [fonte ...]           compara cada congelada com a biblioteca de trabalho; sai com erro se alguma mudou.

biblioteca_exporta.py repõe as congeladas antes de exportar (em memória), então o GLB sempre leva a versão aprovada.
avaliacoes.json: a lista de documentos da coleção, cada um {fonte, id, nota: "boa" | "ruim"}.

Uso: python congeladas.py -- <comando> [args]
"""
import hashlib
import json
import os
import sys

import bpy

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIB = os.path.join(RAIZ, "biblioteca")
CONG = os.path.join(BIB, "congeladas")


def caminhos(fonte):
    """(blend de trabalho, json de trabalho, nome do esqueleto) de uma biblioteca."""
    if fonte.endswith("_gravida"):
        c = fonte[: -len("_gravida")]
        return os.path.join(BIB, "gravida", c + ".blend"), os.path.join(BIB, "gravida", c + ".json"), c
    return os.path.join(BIB, "corrigido_todos", fonte + ".blend"), os.path.join(BIB, "corrigido_todos", fonte + ".json"), fonte


def _fcurves(act):
    for camada in act.layers:
        for strip in camada.strips:
            for cb in strip.channelbags:
                yield from cb.fcurves


def impressao(act):
    """Impressão digital das chaves de uma ação: muda se qualquer chave, interpolação ou intervalo mudar."""
    h = hashlib.sha256()
    h.update(repr(tuple(round(x, 4) for x in act.frame_range)).encode())
    for fc in sorted(_fcurves(act), key=lambda f: (f.data_path, f.array_index)):
        h.update(f"{fc.data_path}[{fc.array_index}]".encode())
        for k in fc.keyframe_points:
            h.update(f"{k.co[0]:.3f},{k.co[1]:.5f},{k.interpolation};".encode())
    return h.hexdigest()


def congeladas_de(fonte):
    d = os.path.join(CONG, fonte)
    if not os.path.isdir(d):
        return {}
    return {f[:-5]: json.load(open(os.path.join(d, f))) for f in sorted(os.listdir(d)) if f.endswith(".json")}


def repoe_em_memoria(fonte, verbose=True):
    """Troca, no arquivo aberto, cada ação congelada da fonte pela cópia congelada. Devolve {id: 'igual'|'reposta'}."""
    res = {}
    for nome, meta in congeladas_de(fonte).items():
        atual = bpy.data.actions.get(nome)
        if atual is not None and impressao(atual) == meta["impressao"]:
            res[nome] = "igual"
            continue
        if atual is not None:
            bpy.data.actions.remove(atual)
        with bpy.data.libraries.load(os.path.join(CONG, fonte, nome + ".blend"), link=False) as (src, dst):
            dst.actions = [nome]
        nova = dst.actions[0]
        nova.name = nome
        nova.use_fake_user = True
        if impressao(nova) != meta["impressao"]:
            raise RuntimeError(f"cópia congelada corrompida: {fonte} {nome}")
        res[nome] = "reposta"
    if verbose and res:
        rep = [k for k, v in res.items() if v == "reposta"]
        print("congeladas", fonte, len(res), "repostas", len(rep), rep, flush=True)
    return res


def _json_repoe(fonte, jpath):
    cong = congeladas_de(fonte)
    if not cong or not os.path.exists(jpath):
        return
    j = json.load(open(jpath))
    for nome, meta in cong.items():
        for campo in ("apoios", "correcoes"):
            if meta.get(campo) is None:
                j.setdefault(campo, {}).pop(nome, None)
            else:
                j.setdefault(campo, {})[nome] = meta[campo]
    json.dump(j, open(jpath, "w"), ensure_ascii=False, indent=1)


def sincroniza(lista):
    boas, ruins = {}, {}
    for d in lista:
        (boas if d.get("nota") == "boa" else ruins if d.get("nota") == "ruim" else {}).setdefault(d["fonte"], set()).add(d["id"])
    json.dump({f: sorted(v) for f, v in sorted(ruins.items())}, open(os.path.join(BIB, "para_corrigir.json"), "w"),
              ensure_ascii=False, indent=1)
    fontes = set(boas) | {f for f in (os.listdir(CONG) if os.path.isdir(CONG) else []) if os.path.isdir(os.path.join(CONG, f))}
    for fonte in sorted(fontes):
        d = os.path.join(CONG, fonte)
        os.makedirs(d, exist_ok=True)
        ja = set(congeladas_de(fonte))
        quer = boas.get(fonte, set())
        for nome in sorted(ja - quer):  # deixou de ser boa: descongela
            for ext in (".blend", ".json"):
                if os.path.exists(os.path.join(d, nome + ext)):
                    os.remove(os.path.join(d, nome + ext))
            print("descongelada", fonte, nome, flush=True)
        novas = sorted(quer - ja)
        if not novas:
            continue
        blend, jpath, _ = caminhos(fonte)
        bpy.ops.wm.open_mainfile(filepath=blend)
        j = json.load(open(jpath)) if os.path.exists(jpath) else {}
        for nome in novas:
            act = bpy.data.actions.get(nome)
            if act is None:
                print("não existe", fonte, nome, flush=True)
                continue
            bpy.data.libraries.write(os.path.join(d, nome + ".blend"), {act}, fake_user=True, compress=True)
            json.dump({"impressao": impressao(act), "apoios": j.get("apoios", {}).get(nome),
                       "correcoes": j.get("correcoes", {}).get(nome)}, open(os.path.join(d, nome + ".json"), "w"),
                      ensure_ascii=False, indent=1)
            print("congelada", fonte, nome, flush=True)
    print("fim sincroniza", {f: len(v) for f, v in boas.items()}, "ruins", {f: len(v) for f, v in ruins.items()})


def repoe(fonte):
    blend, jpath, _ = caminhos(fonte)
    if not congeladas_de(fonte):
        return
    bpy.ops.wm.open_mainfile(filepath=blend)
    res = repoe_em_memoria(fonte)
    if any(v == "reposta" for v in res.values()):
        bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    _json_repoe(fonte, jpath)


def confere(fontes):
    mudaram = []
    for fonte in fontes:
        cong = congeladas_de(fonte)
        if not cong:
            continue
        blend, _, _ = caminhos(fonte)
        bpy.ops.wm.open_mainfile(filepath=blend)
        for nome, meta in cong.items():
            act = bpy.data.actions.get(nome)
            if act is None or impressao(act) != meta["impressao"]:
                mudaram.append((fonte, nome))
        print("conferidas", fonte, len(cong), flush=True)
    for f, n in mudaram:
        print("MUDOU", f, n)
    print("fim confere", "ok" if not mudaram else f"{len(mudaram)} mudaram")
    return not mudaram


if __name__ == "__main__" and "--" in sys.argv:
    a = sys.argv[sys.argv.index("--") + 1:]
    if a[0] == "sincroniza":
        sincroniza(json.load(open(a[1])))
    elif a[0] == "repoe":
        for f in a[1:]:
            repoe(f)
    elif a[0] == "confere":
        todas = sorted(x for x in os.listdir(CONG)) if os.path.isdir(CONG) else []
        sys.exit(0 if confere(a[1:] or todas) else 1)
