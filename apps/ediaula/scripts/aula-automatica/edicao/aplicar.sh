#!/usr/bin/env bash
# Aplica no EdiAula aberto (condutor rodando) os comandos de um .json do montar.py, um por um.
# Uso: aplicar.sh <comandos.json> [--sem-zoom]
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEM_ZOOM="${2:-}"
python -X utf8 -c "
import json, sys
for c in json.load(open(sys.argv[1], encoding='utf8')):
    if sys.argv[2] == '--sem-zoom' and c['tool'] == 'add_zoom':
        continue
    print(c['tool'] + '\t' + json.dumps(c['input'], ensure_ascii=False))
" "$1" "$SEM_ZOOM" | while IFS=$'\t' read -r tool entrada; do
  r=$(TIMEOUT=90 "$AQUI/../comando.sh" ia "$tool" "$entrada" | head -1 | cut -c1-110)
  echo "$tool | $r"
done
