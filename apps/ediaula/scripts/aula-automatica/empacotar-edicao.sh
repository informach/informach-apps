#!/usr/bin/env bash
# Empacota a edição automática aberta no EdiAula em "Parte N - Edição automática.zip", na pasta da parte; o
# pacote anterior vai para "Versão anterior". Uso: empacotar-edicao.sh <curso> <aula> <parte>
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI"
CURSO="$1"; AULA="$2"; N="$3"
PASTA="$(cygpath -u "$(./parte.sh "$CURSO" "$AULA" "$N" info | python -X utf8 -c "import json,sys; print(json.load(sys.stdin)['pasta'])")")"
Z=$(TIMEOUT=900 ./comando.sh acao empacotar.mjs | python -X utf8 -c "import json,sys; print(json.load(sys.stdin)['result']['zip'] or '')")
[ -n "$Z" ] || { echo "o EdiAula não disse onde salvou o pacote" >&2; exit 1; }
Z="$(cygpath -u "$Z")"; P="$PASTA/Parte $N - Edição automática.zip"
if [ -f "$P" ]; then mkdir -p "$PASTA/Versão anterior"; mv -f "$P" "$PASTA/Versão anterior/"; fi
mv "$Z" "$P" && ls -la "$P"
