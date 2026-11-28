#!/usr/bin/env bash
# Retoque das cenas de uma parte já editada, sem refazer a edição (Helena, 28/11/2026: um ajuste nas cenas não pode
# refazer tudo). Gera as cenas de novo na pasta das peças (a que sai igual fica como está e mantém o render), tira o
# render velho das que mudaram sem desfazer o vínculo, renderiza essas no EdiSVG, abre a edição pronta (o clipe
# vinculado troca para o render novo sozinho), salva e empacota.
# Uso: retocar-cenas.sh <curso> <aula> <parte> <script das cenas>
# Precisa dos dois condutores abertos. A capa e as marcações ficam como estão; para mudar trechos (o começo ou o fim
# de uma cena), use o editar-kit.sh.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI"
CURSO="$1"; A="$2"; N="$3"; CENAS="$4"
INFO="$(./parte.sh "$CURSO" "$A" "$N" info)"
campo() { echo "$INFO" | python -X utf8 -c "import json,sys; print(json.load(sys.stdin)['$1'])" | tr -d '\r'; }
ED="$(campo edicao)"; P="$(dirname "$ED")"; B="$ED/animacao"; PROJ="$(campo projeto)"
C="${PROJ%.ediaula} · edição automática.ediaula"
[ -f "$C" ] || { echo "não há edição pronta para retocar: $C" >&2; exit 1; }
(cd "$AQUI/edicao" && AULA_REFAZER_CENAS=1 python -X utf8 "$CENAS" "$A" "$N" "$B/base.edisvg" "$B/blocos" "$P/pecas") \
  | sed 's#.*/##' | cut -c1-120
python -X utf8 edicao/validar_svg.py "$P/pecas" 2>&1 | grep -v "Deprecat\|getdata" | tail -4
python -X utf8 edicao/render_velho.py "$P/pecas"
PECAS="$(python -X utf8 -c "import glob,json,os,sys; print(json.dumps({'semPedido': True, 'svgArquivos': sorted(p.replace(os.sep, '/') for p in glob.glob(os.path.join(sys.argv[1], '*.edisvg')))}, ensure_ascii=False))" "$P/pecas")"
TIMEOUT=1800 ./comando.sh --svg acao renderizar-pecas.mjs "$PECAS" | python -X utf8 -c "
import json, sys
r = json.load(sys.stdin).get('result') or {}
print(len(r.get('renderizadas', [])), 'peças renderizadas agora |', len(r.get('ja_tinham', [])), 'já tinham render')
[print('falhou:', f) for f in r.get('falharam', [])]"
./comando.sh acao abrir-projeto.mjs "{\"arquivo\": \"$C\"}" | grep -o '"result": "[^"]*"' || true
# Espera os clipes vinculados trocarem para o render novo (o EdiAula troca sozinho ao ver o manifesto).
for _ in 1 2 3 4 5 6; do
  ping -n 6 127.0.0.1 >/dev/null
  ./comando.sh acao salvar.mjs >/dev/null
  faltam=$(python -X utf8 -c "
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8')); n = 0
for a in d['assets']:
    l = a.get('link')
    if l:
        it = json.load(open(l['project'][:-len('.edisvg')] + ' · renders/vinculos.json', encoding='utf-8'))['items'][0]
        n += l.get('hash') != (it.get('render') or {}).get('hash')
print(n)" "$C")
  [ "$faltam" = 0 ] && break
done
echo "vínculos desatualizados: $faltam"
./empacotar-edicao.sh "$CURSO" "$A" "$N" 2>&1 | tail -1
