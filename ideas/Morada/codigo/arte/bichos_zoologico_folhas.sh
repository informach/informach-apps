#!/bin/bash
# Folhas de conferência de cada animação composta (5 quadros), uma imagem por animação, e uma pilha por bicho.
# Uso: bichos_zoologico_folhas.sh <SP> [ids]
SP="$1"; shift
OUT="$SP/pets/zoologico/folhas"
mkdir -p "$OUT"
IDS="${@:-girafa elefante bisao zebra cervo hipopotamo urso urso_polar leao tigre crocodilo canguru}"
for id in $IDS; do
  anims=$("$SP/blender-venv/bin/python" -I -c "
import json,sys
c=json.load(open('$SP/pets/zoologico/zoologico.json'))
b=[x for x in c['bichos'] if x['id']=='$id'][0]
pac={'parado','andar','correr','espreguicar'} if b['base']!='Tiger' or '$id' in ('tigre','leao','urso','urso_polar','hipopotamo') else set()
pac = pac if '$id' not in ('crocodilo','canguru') else set()
print(' '.join(a['id'] for a in b['animacoes'] if a['id'] not in pac))")
  lista=""
  for an in $anims; do
    MOVEIS_THREADS=1 AMOSTRAS=${AMOSTRAS:-6} timeout 1200 "$SP/blender-venv/bin/python" -I "$SP/morada-art/bichos_zoologico_render.py" -- anim "$SP/pets/zoologico/glb" "$OUT/${id}_${an}.png" "$id" "$an" 5 > /dev/null 2>&1
    lista="$lista $OUT/${id}_${an}.png"
    echo "feito $id $an"
  done
  "$SP/blender-venv/bin/python" -I "$SP/morada-art/bichos_zoologico_pilha.py" "$OUT/_${id}_todas.png" $lista
done
