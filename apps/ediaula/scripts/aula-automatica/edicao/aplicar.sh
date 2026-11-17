#!/usr/bin/env bash
# Aplica no EdiAula aberto (condutor rodando) os comandos do montar.py e do pecas.py (acoes/aplicar.mjs): cria
# as faixas "Zoom" (logo acima da gravação) e "Marcações" (acima do zoom), põe o zoom, as marcações, a capa e
# as peças .edisvg vinculadas. Escreve <comandos>-aplicado.json com o que foi feito.
# Uso: aplicar.sh <comandos.json> <projeto aberto.ediaula> [--sem-zoom]
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ $# -ge 2 ] || { sed -n '2,5p' "$0"; exit 2; }
caminho() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
COMANDOS="$(caminho "$1")"; PROJETO="$(caminho "$2")"
SEM_ZOOM=false; [ "${3:-}" = "--sem-zoom" ] && SEM_ZOOM=true
ESTADO="$(python -X utf8 -c "import json,sys; print(json.dumps({'comandos': sys.argv[1], 'projeto': sys.argv[2], 'semZoom': sys.argv[3] == 'true', 'saida': sys.argv[1].replace('.json', '-aplicado.json')}, ensure_ascii=False))" "$COMANDOS" "$PROJETO" "$SEM_ZOOM")"
TIMEOUT="${TIMEOUT:-1800}" "$AQUI/../comando.sh" acao aplicar.mjs "$ESTADO" | python -X utf8 -c "
import json, sys
d = json.load(sys.stdin)
r = d.get('result') if d.get('ok', True) else None
if not isinstance(r, dict):
    print(d.get('error') or d); sys.exit(1)
print(f\"{r['aplicados']} comandos | {len(r['pecas'])} peças vinculadas | {r['ancoradas']} caixas encostadas na paleta\")
for f in r['falhas']: print('falhou:', f)
for a in r['aguardando']: print('aguardando o render do EdiSVG:', a)
"
