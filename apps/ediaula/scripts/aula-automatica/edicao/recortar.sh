#!/usr/bin/env bash
# Recorta um bloco de verdade da gravação para usar numa animação do EdiSVG.
# Uso: recortar.sh <pasta da gravação> <segundos da voz> <x0> <y0> <x1> <y1> <saida.png>
#      recortar.sh <pasta da gravação> <segundos da voz> quadro <saida.png>   (o quadro inteiro, para medir)
# As coordenadas são do vídeo da gravação (1920x1080). O PNG sai só com os pedaços que o EdiSVG aceita.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
G="$1"; T="$2"
V=$(python -X utf8 "$AQUI/tempo.py" "$G" "$T" | cut -d' ' -f2)
if [ "$3" = "quadro" ]; then
  ffmpeg -loglevel error -y -ss "$V" -i "$G/tela.mp4" -frames:v 1 "$4"
  python -X utf8 "$AQUI/limpar_png.py" "$4"; echo "$4 (vídeo $V s)"; exit 0
fi
X0=$3; Y0=$4; X1=$5; Y1=$6; S=$7
ffmpeg -loglevel error -y -ss "$V" -i "$G/tela.mp4" -frames:v 1 -vf "crop=$((X1-X0)):$((Y1-Y0)):$X0:$Y0" "$S"
python -X utf8 "$AQUI/limpar_png.py" "$S"
echo "$S (vídeo $V s, $((X1-X0))x$((Y1-Y0)))"
