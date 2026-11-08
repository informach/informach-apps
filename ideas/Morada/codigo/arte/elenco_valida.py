"""Confere o Elenco (elenco.json) contra os catálogos e lista cada problema.

Para cada personagem: campos e id únicos; nome único; corpo conhecido; pele (tom da página ou #rrggbb); expressão; cabelo
(penteado do catálogo que serve no corpo, cor, barba só onde serve); cada peça existe, está no slot certo (objetos nas
mãos: mao_dir / mao_esq), serve no corpo (regras da página, elenco_regras.serve), não repete parte (uma peça inteira
ocupa cima e baixo, a jardineira só baixo) e tem cor #rrggbb ou null; a peça já foi exportada para a página (itens/<id>.txt)
e tem miniatura; recém-nascido só com manta, cabelo.tipo e chupeta; gravidez só em adulta, plus_f e atletica (0 a 3); a
animação sugerida existe na biblioteca do corpo (a de grávida no 2º e 3º trimestres).

Uso: python3 -I elenco_valida.py [elenco.json]     (sai com 1 se houver problema)
"""
import json
import os
import sys
from collections import Counter

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import elenco_regras as E  # noqa: E402

ITENS_PAG = os.path.join(E.SP, "corpos_viewer", "itens")
MINIS = os.path.join(E.SP, "biblioteca", "miniaturas_itens")


def confere(p, vistos_id, vistos_nome):
    erros = []
    err = erros.append
    for k in ("id", "nome", "grupo", "papel", "corpo", "pele", "expressao", "cabelo"):
        if not p.get(k) and k != "cabelo":
            err(f"falta {k}")
    if p.get("id") in vistos_id:
        err("id repetido")
    if p.get("nome") in vistos_nome:
        err("nome repetido")
    vistos_id.add(p.get("id"))
    vistos_nome.add(p.get("nome"))
    c = p.get("corpo")
    if c not in E.CORPOS:
        return erros + [f"corpo desconhecido: {c}"]
    sexo, faixa = E.CORPOS[c]
    if p.get("faixa") and p["faixa"] != faixa:
        err(f"faixa {p['faixa']} não é a do corpo ({faixa})")
    pele = p.get("pele")
    if not (pele in E.TONS or (isinstance(pele, str) and E.HEX.match(pele))):
        err(f"pele inválida: {pele}")
    if p.get("expressao") not in E.EXPR:
        err(f"expressão inválida: {p.get('expressao')}")
    cab = p.get("cabelo") or {}
    cor_ok = lambda v, t: isinstance(v, str) and (v in t or E.HEX.match(v))  # noqa: E731
    if faixa == "recem":
        if cab.get("tipo") not in ("careca", "baixinho", "gorro"):
            err(f"recém-nascido: cabelo.tipo inválido: {cab.get('tipo')}")
        if not cor_ok(cab.get("cor"), E.CABELO_CORES):
            err("recém-nascido: cor do cabelo inválida")
        if not cor_ok(p.get("manta"), E.MANTA_CORES):
            err(f"recém-nascido: manta inválida: {p.get('manta')}")
        if not isinstance(p.get("chupeta"), bool):
            err("recém-nascido: chupeta deve ser true/false")
        if p.get("roupa") or p.get("objetos"):
            err("recém-nascido só usa a manta (sem roupa nem objetos)")
        if p.get("animacao"):
            err("recém-nascido não tem animações")
        return erros
    pent = cab.get("penteado")
    m = E.penteado_serve(pent, c)
    if m:
        err(f"cabelo {pent}: {m}")
    if not cor_ok(cab.get("cor"), E.CABELO_CORES):
        err(f"cor do cabelo inválida: {cab.get('cor')}")
    b = cab.get("barba", "nenhum")
    if b != "nenhum":
        m = E.barba_serve(b, c)
        if m:
            err(f"barba {b}: {m}")
    roupa = p.get("roupa") or {}
    objetos = p.get("objetos") or {}
    pecas = [(slot, v) for slot, v in roupa.items()] + [("mao_" + lado, v) for lado, v in objetos.items()]
    for lado in objetos:
        if lado not in ("dir", "esq"):
            err(f"objetos: lado inválido {lado}")
    for slot in roupa:
        if slot.startswith("mao_"):
            err(f"objeto de mão {slot} deve ir em 'objetos'")
        if slot not in E.SLOTS:
            err(f"parte desconhecida: {slot}")
    ocupado = Counter()
    for slot, v in pecas:
        rid = (v or {}).get("id")
        if rid not in E.ITENS:
            err(f"{slot}: peça não existe: {rid}")
            continue
        it = E.ITENS[rid]
        if it.get("slot") != slot:
            err(f"{rid}: slot certo é {it.get('slot')}, não {slot}")
        m = E.serve(rid, c)
        if m:
            err(f"{rid} não serve em {c}: {m}")
        cor = v.get("cor")
        if cor is not None and not (isinstance(cor, str) and E.HEX.match(cor)):
            err(f"{rid}: cor inválida {cor}")
        ocupado[slot] += 1
        for s in E.cobre(rid):
            ocupado[s] += 1
        if not os.path.exists(os.path.join(ITENS_PAG, rid + ".txt")):
            err(f"{rid}: sem arquivo da página (itens/{rid}.txt)")
        if not os.path.exists(os.path.join(MINIS, rid + ".webp")):
            err(f"{rid}: sem miniatura")
    for s, k in ocupado.items():
        if k > 1:
            err(f"parte {s} ocupada {k} vezes")
    if not roupa:
        err("sem roupa")
    elif not ("inteira" in roupa or "baixo" in roupa):
        err("sem parte de baixo nem peça inteira")
    g = p.get("gravidez", 0)
    if c in E.COM_GRAVIDA:
        if g not in (0, 1, 2, 3):
            err(f"gravidez inválida: {g}")
    elif g:
        err("gravidez só em adulta, plus_f e atletica")
    a = p.get("animacao")
    if not a:
        err("sem animação sugerida")
    elif not E.anim_existe(a, c, g):
        err(f"animação {a} não existe na biblioteca {E.fonte_anim(c, g)}")
    if p.get("veiculo") and p["veiculo"] not in ("bicicleta", "skate", "patinete"):
        err(f"veículo inválido: {p['veiculo']}")
    return erros


def main():
    arq = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "elenco.json")
    d = json.load(open(arq))
    ps = d["personagens"]
    vi, vn = set(), set()
    total = 0
    for p in ps:
        es = confere(p, vi, vn)
        for e in es:
            print(f"{p.get('id')}: {e}")
        total += len(es)
    grupos = Counter(p["grupo"] for p in ps)
    for g in grupos:
        if g not in d.get("grupos", {}):
            print(f"grupo sem rótulo: {g}")
            total += 1
    print(f"{len(ps)} personagens {dict(grupos)}; {total} problema(s)")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
