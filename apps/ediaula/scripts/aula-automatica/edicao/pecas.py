"""Peças .edisvg da aula no lugar das anotações geradas pelo EdiAula.

Uso: pecas.py <comandos.json> <pasta das peças> [--animacoes '[[ini, fim], ...]'] [--capa '{"kicker": ..., ...}']

A aula recebe as peças gráficas prontas em .edisvg. O nome do arquivo diz o papel e a ordem da peça:
  capa[-<nome>].edisvg                      a capa (por cima dos primeiros segundos)
  caixa-01-programacao.edisvg               a 1ª caixa das categorias da aula
  destaque-03-bloco-se.edisvg               o 3º destaque
  balao-02-verificar.edisvg                 o 2º balão
  conceito-2-a-pergunta-certa.edisvg        a animação do 2º trecho de --animacoes (vai no lugar da tela)
  secao-01-<nome>.edisvg, encerramento[-<nome>].edisvg
Cada peça que acha o seu lugar troca a anotação gerada por um vínculo com o arquivo (comando "_vincular" do
acoes/aplicar.mjs): o clipe abre no EdiSVG com 2 cliques e se atualiza quando o arquivo é salvo. O EdiAula só
ajusta tempo, posição, escala e camada; o conteúdo (texto, cor, número) é do EdiSVG.

O que não veio em .edisvg continua gerado pelo EdiAula e vai para a lista "criada sem .edisvg". Peça sem lugar
(número além das marcações da aula, papel sem tempo definido, como a seção) e peça cujo nome não bate com o
que a fala diz no lugar dela vão para "revisar". Reescreve <comandos.json> e escreve <comandos>-pecas.json.
"""

import argparse
import glob
import json
import os
import re
import unicodedata

ap = argparse.ArgumentParser()
ap.add_argument("comandos")
ap.add_argument("pasta")
ap.add_argument("--animacoes", default="[]")
ap.add_argument("--capa", default="{}")
ap.add_argument("--capa-duracao", type=float, default=3.0)
args = ap.parse_args()

W, H = 1920, 1080
PAPEIS = ("capa", "secao", "caixa", "balao", "destaque", "conceito", "encerramento")
NOME = re.compile(r"^(?P<papel>[a-z]+)(?:-(?P<n>\d+))?(?:-(?P<slug>.+))?$")

cmds = json.load(open(args.comandos, encoding="utf8"))
ANIM = sorted(json.loads(args.animacoes))
relatorio = {"vinculadas": [], "criadas_sem_edisvg": [], "revisar": []}


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def palavras(s):
    return {w for w in re.split(r"[^a-z0-9]+", fold(s)) if len(w) > 1}


def prancheta(arq):
    """Tamanho da prancheta padrão e a animação (a única ou a primeira) de um .edisvg."""
    d = json.load(open(arq, encoding="utf8"))
    boards = d.get("artboards") or []
    board = next((a for a in boards if a.get("id") == d.get("defaultArtboardId")), boards[0] if boards else None)
    vb = (board or {}).get("scene", {}).get("viewBox") or [0, 0, W, H]
    anims = (d.get("motion") or {}).get("animations") or []
    if not anims:
        raise SystemExit(f"{os.path.basename(arq)}: o projeto não tem animação (salve uma no EdiSVG)")
    a = anims[0]
    return {"w": vb[2], "h": vb[3], "animacao": a["id"], "nome": a.get("name"),
            "duracao": max(1, a.get("frames", 1)) / (a.get("fps") or 30)}


pecas = {}
for arq in sorted(glob.glob(os.path.join(args.pasta, "*.edisvg"))):
    m = NOME.match(os.path.splitext(os.path.basename(arq))[0].lower())
    if not m or m["papel"] not in PAPEIS:
        relatorio["revisar"].append(f"{os.path.basename(arq)}: o nome não diz o papel ({', '.join(PAPEIS)})")
        continue
    chave = (m["papel"], int(m["n"]) if m["n"] else 1)
    if chave in pecas:
        relatorio["revisar"].append(f"{os.path.basename(arq)}: outra peça já é {chave[0]} {chave[1]}")
        continue
    pecas[chave] = {"arquivo": os.path.abspath(arq).replace("\\", "/"), "slug": m["slug"] or "",
                    **prancheta(arq)}


def vincular(peca, papel, at, duracao, nota, faixa, lugar=None):
    """O comando que põe a peça na aula, vinculada. lugar: a anotação que ela substitui (posição e zoom)."""
    entrada = {"arquivo": peca["arquivo"], "animacao": peca["animacao"], "at": round(at, 2),
               "duration": round(duracao, 2), "track_id": faixa}
    quadro = abs(peca["w"] / peca["h"] - W / H) < 0.02 and peca["w"] >= 960
    s, cx, cy = (lugar or {}).get("zoom") or [1, 0.5, 0.5]
    if quadro:
        # Desenhada no quadro inteiro, sobre a tela sem zoom: acompanha o zoom como a gravação.
        entrada.update(x=round((0.5 - cx) * s + 0.5, 4), y=round((0.5 - cy) * s + 0.5, 4), scale=round(s, 4))
    elif lugar:
        # Peça do tamanho dela: no centro da anotação, no tamanho desenhado (x s do zoom).
        i = lugar["input"]
        entrada.update(x=i["x"], y=i["y"], scale=round(max(peca["w"] / W, peca["h"] / H) * s, 4))
        if "ancora_esquerda" in lugar:
            # A ponta na paleta: a borda esquerda no ponto da caixa gerada (a peça aparece com s x w px).
            entrada["x"] = round(lugar["ancora_esquerda"] + s * peca["w"] / 2 / W, 4)
    return {"tool": "_vincular", "input": entrada, "papel": papel, "nota": f"{nota} · {os.path.basename(peca['arquivo'])}"}


saida = []
contagem = {}
for c in cmds:
    papel = c.get("papel")
    if c["tool"] != "add_annotation" or papel not in ("caixa", "destaque", "balao"):
        saida.append(c)
        continue
    contagem[papel] = contagem.get(papel, 0) + 1
    n = contagem[papel]
    peca = pecas.pop((papel, n), None)
    if not peca:
        saida.append(c)
        relatorio["criadas_sem_edisvg"].append(f"{c['input']['at']:.1f}s: {papel} {n:02d} ({c['nota']})")
        continue
    i = c["input"]
    novo = vincular(peca, papel, i["at"], i["duration"], c["nota"], "$MARCACOES", c)
    saida.append(novo)
    relatorio["vinculadas"].append(novo["nota"])
    fala = palavras(i.get("text", "") + " " + str(c.get("alvo", "")) + " " + c["nota"])
    if peca["slug"] and not (palavras(peca["slug"]) & fala):
        relatorio["revisar"].append(f"{i['at']:.1f}s: conferir se {os.path.basename(peca['arquivo'])} é o {papel} "
                                    f"certo para «{c['nota']}»")

# Animações de conceito: a N-ésima peça vai no N-ésimo trecho (o acabamento a põe no lugar da tela).
for k, (a, b) in enumerate(ANIM, start=1):
    peca = pecas.pop(("conceito", k), None)
    if not peca:
        relatorio["criadas_sem_edisvg"].append(f"{a:.1f}s: conceito {k} (sem conceito-{k}-*.edisvg)")
        continue
    if abs(peca["duracao"] - (b - a)) > 0.5:
        relatorio["revisar"].append(f"{a:.1f}s: conceito-{k} dura {peca['duracao']:.1f}s, o trecho dura {b - a:.1f}s")
    saida.append(vincular(peca, "conceito", a, peca["duracao"], f"conceito {k}", None))
    relatorio["vinculadas"].append(saida[-1]["nota"])

# Capa: a peça por cima dos primeiros segundos, ou o template do EdiAula no mesmo padrão.
capa = pecas.pop(("capa", 1), None)
if capa:
    saida.insert(0, vincular(capa, "capa", 0.0, args.capa_duracao, "capa", "$CAPA"))
    relatorio["vinculadas"].append(saida[0]["nota"])
else:
    saida.insert(0, {"tool": "add_template", "papel": "capa", "nota": "capa (template do EdiAula)",
                     "input": {"template": "opening", "over_lesson": True, "duration": args.capa_duracao,
                               "fields": json.loads(args.capa)}})
    relatorio["criadas_sem_edisvg"].append("0.0s: capa (template opening do EdiAula)")

for (papel, n), peca in sorted(pecas.items()):
    relatorio["revisar"].append(f"{os.path.basename(peca['arquivo'])}: {papel} {n} sem lugar na aula "
                                f"(ponha à mão: {'sem tempo definido' if papel in ('secao', 'encerramento') else 'número além das marcações'})")

saida.sort(key=lambda c: c["input"].get("at", 0))
json.dump(saida, open(args.comandos, "w", encoding="utf8"), ensure_ascii=False, indent=1)
json.dump(relatorio, open(args.comandos.replace(".json", "-pecas.json"), "w", encoding="utf8"),
          ensure_ascii=False, indent=1)
print(f"{len(relatorio['vinculadas'])} peças vinculadas | {len(relatorio['criadas_sem_edisvg'])} criadas sem .edisvg "
      f"| {len(relatorio['revisar'])} para revisar")
for r in relatorio["revisar"]:
    print("revisar:", r)
