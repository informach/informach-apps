"""Monta o índice da biblioteca de sons (sons_out/sons.json), o creditos.json final e liga a página
sons_viewer/sons.html à pasta dos sons (sons_viewer/sons → ../sons_out)."""
import glob, json, os, datetime
from sons_lib import OUT, REG, SP

CATEGORIAS = [
    ("interface", "Interface", "Cliques, painéis, respostas, dinheiro, progresso, velocidade do tempo e modo construir."),
    ("casa", "Casa e ações", "Um som por animação de uso: banheiro, cozinha, portas e móveis, eletrônicos, passos, quarto e limpeza."),
    ("bichos", "Bichos", "Cachorros de três tamanhos, gatos, aves e bichos do zoológico."),
    ("ambientes", "Cidade e clima", "Laços de 45 a 48 s para o fundo: bairro, centro, praia, parque, parque de diversões, chuva e vento."),
    ("voz", "Voz inventada", "O moradês: fala sem palavras reais, por idade, voz e emoção, com a boca sincronizada."),
    ("musica", "Música", "Sete músicas compostas por código, cada uma com início, laço e fim."),
]


def main():
    itens = {}
    for f in sorted(glob.glob(os.path.join(REG, "*.json"))):
        if os.path.basename(f).startswith("_"):
            continue
        for k, v in json.load(open(f)).items():
            itens[f"{v['cat']}/{k}"] = v
    cred_todos = json.load(open(os.path.join(REG, "_creditos.json")))
    usados = {c for v in itens.values() for c in v["creditos"]}
    creditos = {k: dict(v, usado_em=sorted(i for i, it in itens.items() if k in it["creditos"])) for k, v in cred_todos.items() if k in usados}
    conf_p = os.path.join(OUT, "_conferencia.json")
    conf = json.load(open(conf_p))["medidas"] if os.path.exists(conf_p) else {}
    sons = {}
    for k, v in itens.items():
        e = {c: v[c] for c in ("id", "cat", "grupo", "nome", "arquivo", "laco", "dur", "canais", "origem", "creditos", "descricao", "alvo_lufs")}
        for c in ("idade", "sexo", "emocao", "texto", "bpm", "musica", "parte", "titulo", "entrada_do_laco_s", "compassos"):
            if c in v:
                e[c] = v[c]
        m = conf.get(k, {}).get("ogg")
        if m:
            e["medidas"] = {"lufs": m["lufs"], "pico_real_dbtp": m["pico_real_dbtp"], "dur": m["dur"]}
            if v["laco"]:
                e["medidas"]["emenda_salto_p99"] = m.get("emenda_salto_p99")
                e["medidas"]["emenda_estalo_db"] = m.get("emenda_estalo_db")
        sons[k] = e
    cats = []
    for cid, nome, desc in CATEGORIAS:
        grupos = {}
        for k, v in sons.items():
            if v["cat"] == cid:
                grupos.setdefault(v["grupo"], []).append(k)
        n_s = sum(1 for v in sons.values() if v["cat"] == cid and v["origem"] == "sintetizado")
        n_c = sum(1 for v in sons.values() if v["cat"] == cid and v["origem"] != "sintetizado")
        cats.append({"id": cid, "nome": nome, "descricao": desc, "sintetizados": n_s, "cc0": n_c,
                     "grupos": [{"nome": g, "sons": ks} for g, ks in grupos.items()]})
    # voz: frases por combinação
    frases = {}
    for k, v in sons.items():
        if v["cat"] == "voz":
            frases.setdefault(f"{v['idade']}_{v['sexo']}_{v['emocao']}", []).append(k)
    indice = {"titulo": "Sons do Morada", "gerado": datetime.date.today().isoformat(), "taxa": 44100,
              "formatos": ["ogg", "mp3"], "categorias": cats, "sons": sons, "creditos": creditos,
              "voz": {"frases": frases, "modulo": "voz/morada_voz.js", "boca": "voz/boca.json"}}
    json.dump(indice, open(os.path.join(OUT, "sons.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"observacao": "Arquivos de terceiros usados na biblioteca de sons do Morada. Só CC0 (domínio público). "
                              "Tudo o que não está aqui foi sintetizado por código (sons_*.py).",
               "arquivos": creditos}, open(os.path.join(OUT, "creditos.json"), "w"), indent=1, ensure_ascii=False)
    viewer = os.path.join(SP, "sons_viewer")
    os.makedirs(viewer, exist_ok=True)
    link = os.path.join(viewer, "sons")
    if not os.path.islink(link):
        os.symlink("../sons_out", link)
    tot_s = sum(c["sintetizados"] for c in cats)
    tot_c = sum(c["cc0"] for c in cats)
    print(f"{len(sons)} sons ({tot_s} sintetizados, {tot_c} de CC0), {len(creditos)} arquivos de terceiros creditados")
    for c in cats:
        print(f"  {c['nome']:16s} {c['sintetizados']:4d} sintetizados  {c['cc0']:3d} CC0")


if __name__ == "__main__":
    main()
