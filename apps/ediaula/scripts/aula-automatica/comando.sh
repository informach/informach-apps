#!/usr/bin/env bash
# Manda um comando ao condutor (condutor.mts). Uso:
#   comando.sh [--svg] acao <acoes/arquivo.mjs> ['{"chave": "valor"}']   junta o JSON ao estado e roda a ação
#   comando.sh [--svg] estado '{"chave": "valor"}'                        só junta ao estado (ctx.state)
#   comando.sh [--svg] js '<corpo de função assíncrona com ctx>'
#   comando.sh ia <ferramenta> '<json>'      chama uma ferramenta do EdiAula (as do assistente/MCP) e imprime o texto
# --svg fala com o condutor do EdiSVG (porta 47999); sem ele, com o do EdiAula (47998). TIMEOUT em segundos.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTA=47998
if [ "${1:-}" = "--svg" ]; then PORTA=47999; shift; fi
modo="${1:-}"; shift || true
EST="${2:-}"; [ -n "$EST" ] || EST="{}"
corpo="$(mktemp)"
trap 'rm -f "$corpo"' EXIT

caminho() { # caminho absoluto no formato do Node no Windows
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else (cd "$(dirname "$1")" && echo "$(pwd)/$(basename "$1")"); fi
}

case "$modo" in
  acao)
    arq="$1"; [ -f "$arq" ] || arq="$AQUI/$1"; [ -f "$arq" ] || arq="$AQUI/acoes/$1"
    [ -f "$arq" ] || { echo "ação não encontrada: $1" >&2; exit 2; }
    python -X utf8 -c '
import json, sys
arq, estado = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "{}"
json.loads(estado)
print(f"Object.assign(ctx.state, {estado});\n"
      f"const {{ pathToFileURL }} = await import(\"node:url\");\n"
      f"const m = await import(pathToFileURL({json.dumps(arq)}).href + \"?v=\" + Date.now());\n"
      f"return await m.default(ctx);")
' "$(caminho "$arq")" "$EST" > "$corpo" ;;
  estado)
    python -X utf8 -c 'import json,sys; json.loads(sys.argv[1]); print(f"Object.assign(ctx.state, {sys.argv[1]}); return ctx.state;")' "$1" > "$corpo" ;;
  js)
    printf '%s' "$1" > "$corpo" ;;
  ia)
    python -X utf8 -c 'import json,sys; d={"name": sys.argv[1], "input": json.loads(sys.argv[2])}; print("ctx.state.ia = " + json.dumps(d, ensure_ascii=False) + "; return 1")' "$1" "$EST" > "$corpo"
    curl -s --max-time 30 -X POST --data-binary "@$corpo" "http://127.0.0.1:$PORTA/eval" >/dev/null
    "$0" acao ia.mjs | python -X utf8 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result') if d.get('ok') else d.get('error'); print(r['text'] if isinstance(r,dict) and 'text' in r else r)"
    exit 0 ;;
  *) sed -n '2,8p' "$0"; exit 2 ;;
esac
curl -s --max-time "${TIMEOUT:-600}" -X POST --data-binary "@$corpo" "http://127.0.0.1:$PORTA/eval"
echo
