#!/usr/bin/env bash
# A vinheta final no último vídeo de uma aula (Helena, 27/11/2026): na faixa da tela, logo depois do último clipe,
# com o som dela. O editar-parte.sh chama no fim da edição; sozinho, serve para pôr a vinheta numa edição já feita
# (depois, empacotar-edicao.sh).
# Uso: vinheta.sh <curso> <aula> <parte> <projeto .ediaula aberto no EdiAula do condutor>
# Só age na última parte da aula com vídeo ("ultimaDaAula" do config.py) e com o arquivo "vinhetaFinal" do config.
# Rodar de novo não duplica: a vinheta que já está na linha do tempo sai e entra outra vez no fim.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI"
CURSO="$1"; AULA="$2"; N="$3"; PROJ="$4"
INFO="$(./parte.sh "$CURSO" "$AULA" "$N" info)"
v() { python -X utf8 -c "import json,sys; print(json.loads(sys.argv[1])[sys.argv[2]] or '')" "$INFO" "$1"; }
[ "$(v ultimaDaAula)" = "True" ] || { echo "vinheta: a Parte $N não é a última da aula; nada a fazer"; exit 0; }
VIN="$(v vinhetaFinal)"
if [ -z "$VIN" ] || [ ! -f "$VIN" ]; then
  echo "AVISO: esta é a última parte da aula, mas a vinheta final não foi achada (\"vinhetaFinal\" no config.json: $VIN)"
  exit 0
fi
rev() { ./comando.sh ia get_overview '{}' | grep -o "Revisão do projeto: [0-9]*" | grep -o "[0-9]*$"; }
VNOME="$(basename "${VIN%.*}")"
LV=$(TIMEOUT=300 ./comando.sh acao importar.mjs "{\"arquivos\": [\"$VIN\"]}" | python -X utf8 -c "import json,sys; r=json.load(sys.stdin)['result']; print('\n'.join(l for l in r.splitlines() if l.startswith('- [a')))")
VID=$(echo "$LV" | grep -F "] $VNOME" | head -1 | grep -o "^- \[a[a-z0-9]*\]" | grep -o "a[a-z0-9]*")
O=$(./comando.sh ia get_overview '{}')
# A vinheta que já está na linha do tempo (de uma vez anterior ou da importação) sai, e ela entra no fim.
JA=$(echo "$O" | grep "^- \[t" | grep -o "\[c[a-z0-9]\{8,\}\] $VNOME [0-9]" | grep -o "c[a-z0-9]\{8,\}" | paste -sd, | sed 's/,/", "/g' || true)
if [ -n "$JA" ]; then ./comando.sh ia remove_clips "{\"clip_ids\": [\"$JA\"], \"revision\": $(rev)}" | head -1; fi
./comando.sh acao salvar.mjs >/dev/null
# O fim exato sai do projeto salvo: o resumo arredonda a 0,1 s, e a vinheta não cobre nada (encostada num clipe que
# passa 0,03 s dela, iria para outra faixa).
FIM=$(python -X utf8 -c "
import json, sys
d = json.load(open(sys.argv[1], encoding='utf8'))
print(round(max(c['start'] + c['duration'] for c in d['clips']), 3))" "$PROJ")
# A faixa da gravação da tela; numa parte toda em animação, a das animações de conceito (que vão no lugar da tela).
O=$(./comando.sh ia get_overview '{}')
TELA=$( (echo "$O" | grep "^- \[t" | grep "\] Tela "; echo "$O" | grep "^- \[t" | grep "\] Conceito · ") | head -1 | grep -o "^- \[t[a-z0-9]*\]" | grep -o "t[a-z0-9]*" || true)
[ -n "$TELA" ] || { echo "vinheta: não achei a faixa da tela nem a das animações" >&2; exit 1; }
# O volume da vinheta acompanha o da voz da parte (Helena, 27/11/2026: "o som dela tá muito alto, muito
# desproporcional"): a vinheta do Cadê tinha -13,7 LUFS e a voz -24,7, 11 dB acima. Fica 1 dB abaixo da voz.
lufs() { ffmpeg -hide_banner -nostats -i "$1" -af ebur128=framelog=quiet -f null - 2>&1 | grep -A2 "Integrated loudness" | grep -o "I: *-\?[0-9.]*" | grep -o "\-\?[0-9.]*$"; }
PW="$(v pasta)"
L_VOZ=$(lufs "$PW/Parte $N - Áudio.wav"); L_VIN=$(lufs "$VIN")
VOL=$(python -X utf8 -c "import sys; v, n = float(sys.argv[1]), float(sys.argv[2]); print(round(min(1.0, max(0.05, 10 ** ((v - n - 1) / 20))), 3))" "$L_VOZ" "$L_VIN")
echo "vinheta: voz $L_VOZ LUFS, vinheta $L_VIN LUFS, volume $VOL"
./comando.sh ia add_clip "{\"media_id\": \"$VID\", \"track_id\": \"$TELA\", \"at\": $FIM, \"volume\": $VOL}" | head -1
./comando.sh acao salvar.mjs >/dev/null
