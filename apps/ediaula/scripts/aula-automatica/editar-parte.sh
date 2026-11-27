#!/usr/bin/env bash
# Edição automática de uma parte já gravada, numa cópia nova do projeto ("<projeto> · edição automática").
# Uso: editar-parte.sh <curso> <aula> <parte> '<trechos json>'
#   trechos: os [ini, fim] das animações de <parte>/pecas, na ordem dos números das peças (conceito-1-…,
#            conceito-2-…), o que o script de cenas do curso imprime (edicao/exemplos/<curso>-conceitos.py).
#            '[]' quando a parte não tem animação.
# O personagem (Debinha, Dedé) entra sozinho no segundo da fala dele (edicao/personagem.py).
# Precisa dos dois condutores abertos (condutor.mts ediaula e edisvg). No fim, confira edicao/relatorio.md e
# empacote com empacotar-edicao.sh.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI"
CURSO="$1"; AULA="$2"; N="$3"; TRECHOS="$4"
INFO="$(./parte.sh "$CURSO" "$AULA" "$N" info)"
v() { python -X utf8 -c "import json,sys; print(json.loads(sys.argv[1])[sys.argv[2]] or '')" "$INFO" "$1"; }
PW="$(v pasta)"; PASTA="$(cygpath -u "$PW")"; MUSICA="$(v musica)"
[ -f "$MUSICA" ] || { echo "a música do curso não existe: $MUSICA (\"musica\" no config.json)" >&2; exit 1; }
PERS=()
SAIDA="$(python -X utf8 edicao/personagem.py "$CURSO" "$AULA" "$N")"  # para aqui se a fala não for achada
while IFS= read -r linha; do [ -n "$linha" ] && PERS+=("$linha"); done <<<"$SAIDA"
echo "personagens: ${PERS[*]:-nenhum}"
./parte.sh "$CURSO" "$AULA" "$N" montar "$TRECHOS" 2>&1 | tail -3
C=$(./parte.sh "$CURSO" "$AULA" "$N" copia 2>&1 | tail -1)
echo "cópia: $C"
./comando.sh acao abrir-projeto.mjs "{\"arquivo\": \"$C\"}" | grep result
ARQS="\"$PW/Parte $N - HeyGen.mp4\", \"$MUSICA\""
for p in "${PERS[@]}"; do ARQS="$ARQS, \"$PW/${p%%@*}\""; done
L=$(TIMEOUT=300 ./comando.sh acao importar.mjs "{\"arquivos\": [$ARQS]}" | python -X utf8 -c "import json,sys; r=json.load(sys.stdin)['result']; print('\n'.join(l for l in r.splitlines() if l.startswith('- [a')))")
mid() { echo "$L" | grep -F "$1" | head -1 | grep -o "^- \[a[a-z0-9]*\]" | grep -o "a[a-z0-9]*"; }
rev() { ./comando.sh ia get_overview '{}' | grep -o "Revisão do projeto: [0-9]*" | grep -o "[0-9]*$"; }
# A música e os personagens que a importação já pôs na linha do tempo saem: a música entra pelo acabamento,
# os personagens no lugar da fala.
NOMES="$(basename "${MUSICA%.*}")\|Parte $N - HeyGen"
for p in "${PERS[@]}"; do arq="${p%%@*}"; NOMES="$NOMES\|${arq%.mp4}"; done
O=$(./comando.sh ia get_overview '{}')
AUTO=$(echo "$O" | grep "^- \[t" | grep -o "\[c[a-z0-9]\{8,\}\] \($NOMES\) [0-9]" | grep -o "c[a-z0-9]\{8,\}" | paste -sd, | sed 's/,/", "/g' || true)
if [ -n "$AUTO" ]; then ./comando.sh ia remove_clips "{\"clip_ids\": [\"$AUTO\"], \"revision\": $(rev)}" | head -1; fi
./comando.sh ia add_clip "{\"media_id\": \"$(mid "Parte $N - HeyGen")\", \"at\": 0}" | head -1
for p in "${PERS[@]}"; do
  IFS=@ read -r arq at ini fim <<<"$p"
  DC=$(./comando.sh ia add_clip "{\"media_id\": \"$(mid "${arq%.mp4}")\", \"at\": $at}" | head -1)
  DID=$(echo "$DC" | grep -o "\[c[a-z0-9]\{8,\}\]" | head -1 | tr -d '[]')
  ./comando.sh ia trim_clip "{\"clip_id\": \"$DID\", \"start\": $ini, \"end\": $fim, \"revision\": $(rev)}" | head -1
done
./comando.sh acao salvar.mjs >/dev/null
# O parte.sh aplicar também abre e salva no EdiSVG, uma de cada vez, as peças sem render (os pedidos de vínculo
# chegam juntos e só o último vira render).
./parte.sh "$CURSO" "$AULA" "$N" aplicar 2>&1 | tail -6
PEC="$PASTA/pecas"
if ls "$PEC"/*.edisvg >/dev/null 2>&1; then
  total=$(ls "$PEC"/*.edisvg | wc -l)
  for _ in $(seq 1 90); do
    ok=0
    for f in "$PEC"/*.edisvg; do r="${f%.edisvg} · renders/vinculos.json"; [ -f "$r" ] && grep -q '"file"' "$r" && ok=$((ok+1)); done
    [ "$ok" -ge "$total" ] && break
    ping -n 4 127.0.0.1 >/dev/null
  done
  echo "renders: $ok de $total"
fi
./comando.sh ia set_palette '{"palette": "Sistema Zero", "fonts": true, "mode": "apply"}' | head -1
./comando.sh acao salvar.mjs >/dev/null
./parte.sh "$CURSO" "$AULA" "$N" acabamento 2>&1 | tail -4
# A primeira animação começa debaixo da capa: sem transição.
PRIM=$(./comando.sh ia get_overview '{}' | grep -o "\[c[a-z0-9]\{8,\}\] Conceito · [^;]* 0:00\.[0-9]" | head -1 | grep -o "^\[c[a-z0-9]*" | tr -d '[' || true)
if [ -n "$PRIM" ]; then ./comando.sh ia set_transition "{\"clip_ids\": [\"$PRIM\"], \"kind\": \"none\"}" | head -1; fi
# O último vídeo da aula termina com a vinheta final (Helena, 27/11/2026): na faixa da tela, logo depois do último
# clipe, com o som dela. O fim exato sai do projeto salvo (o resumo arredonda a 0,1 s, e a vinheta não cobre nada:
# encostada num clipe que passa 0,03 s dela, iria para outra faixa).
if [ "$(v ultimaDaAula)" = "True" ]; then
  VIN="$(v vinhetaFinal)"
  if [ -n "$VIN" ] && [ -f "$VIN" ]; then
    ./comando.sh acao salvar.mjs >/dev/null
    FIM=$(python -X utf8 -c "
import json, sys
d = json.load(open(sys.argv[1], encoding='utf8'))
print(round(max(c['start'] + c['duration'] for c in d['clips']), 3))" "$C")
    LV=$(TIMEOUT=300 ./comando.sh acao importar.mjs "{\"arquivos\": [\"$VIN\"]}" | python -X utf8 -c "import json,sys; r=json.load(sys.stdin)['result']; print('\n'.join(l for l in r.splitlines() if l.startswith('- [a')))")
    VNOME="$(basename "${VIN%.*}")"
    VID=$(echo "$LV" | grep -F "] $VNOME" | head -1 | grep -o "^- \[a[a-z0-9]*\]" | grep -o "a[a-z0-9]*")
    O=$(./comando.sh ia get_overview '{}')
    # A importação que já pôs a vinheta em algum lugar: sai, e ela entra no fim.
    JA=$(echo "$O" | grep "^- \[t" | grep -o "\[c[a-z0-9]\{8,\}\] $VNOME [0-9]" | grep -o "c[a-z0-9]\{8,\}" | paste -sd, | sed 's/,/", "/g' || true)
    if [ -n "$JA" ]; then ./comando.sh ia remove_clips "{\"clip_ids\": [\"$JA\"], \"revision\": $(rev)}" | head -1; fi
    TELA=$(echo "$O" | grep "^- \[t" | grep "\] Tela " | head -1 | grep -o "^- \[t[a-z0-9]*\]" | grep -o "t[a-z0-9]*")
    ./comando.sh ia add_clip "{\"media_id\": \"$VID\", \"track_id\": \"$TELA\", \"at\": $FIM}" | head -1
    ./comando.sh acao salvar.mjs >/dev/null
  else
    echo "AVISO: esta é a última parte da aula, mas a vinheta final não foi achada (\"vinhetaFinal\" no config.json: $VIN)"
  fi
fi
TIMEOUT=600 ./comando.sh ia transcribe '{"language": "pt"}' | head -1
./parte.sh "$CURSO" "$AULA" "$N" revisao 2>&1 | tail -1
sed -n '/Para revisão humana/,/Marcações/p' "$PASTA/edicao/relatorio.md"
