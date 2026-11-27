#!/usr/bin/env bash
# Edição de uma parte com o kit aprovado (REGRAS.md, seção 10; 27/11/2026): gera as cenas do curso em <parte>/pecas
# com os tempos da tomada atual e a abertura com a capa do curso (capa-abertura.edisvg), confere tudo no validador
# (técnico e desenho; com problema, para), tira dos nomes das cenas os trechos e chama o editar-parte.sh.
# Uso: editar-kit.sh <curso> <aula> <parte> <script das cenas> <arte da capa> "<fala da abertura>"
#   ex.: editar-kit.sh cade 1 4 exemplos/cade-conceitos-regravacao.py capa-cade "Bora fazer alguém aparecer?"
# Precisa dos condutores do EdiAula e do EdiSVG abertos. A pasta da parte vem do parte.sh info.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURSO="$1"; A="$2"; N="$3"; CENAS="$4"; ARTE="$5"; FALA="$6"
INFO="$("$AQUI/parte.sh" "$CURSO" "$A" "$N" info)"
campo() { echo "$INFO" | python -X utf8 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ED="$(campo edicao)"; P="$(dirname "$ED")"; TIT="$(campo tituloCapa)"
B="$ED/animacao"
cd "$AQUI/edicao"
OUT=$(AULA_REFAZER_CENAS=1 python -X utf8 "$CENAS" "$A" "$N" "$B/base.edisvg" "$B/blocos" "$P/pecas")
echo "$OUT" | sed 's#.*/pecas/##'
python -X utf8 capa_kit.py "$B/base.edisvg" "$B/blocos" "$P/pecas" --arte "$ARTE" --aula "$A" --parte "$N" \
  --titulo "$TIT" --fala "$FALA" | sed 's#.*/pecas/##'
python -X utf8 validar_svg.py "$P/pecas" | tail -1
T=$(echo "$OUT" | python -X utf8 -c "
import sys, re, json
t = []
for linha in sys.stdin:
    m = re.search(r'/(conceito-(\d+)-[^/]*)\.edisvg \|.*\| ([\d.]+)-([\d.]+)\s*$', linha)
    if m: t.append((int(m.group(2)), float(m.group(3)), float(m.group(4))))
t.sort()
assert [k for k, _, _ in t] == list(range(1, len(t) + 1)), t
print(json.dumps([[a, b] for _, a, b in t]))")
echo "trechos: $T"
cd "$AQUI"
./parte.sh "$CURSO" "$A" "$N" decisoes | tail -1
./editar-parte.sh "$CURSO" "$A" "$N" "$T"
