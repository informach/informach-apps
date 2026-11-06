#!/bin/bash
# Comprime os GLB dos corpos (Meshopt: geometria quantizada e comprimida; esqueleto, formas de gravidez e extras ficam).
# A página e o jogo leem com o MeshoptDecoder do three.js. Uso: bash tools/comprime_corpos.sh <pasta com os .glb>
cd "$(dirname "$0")/.."
G=gltft/node_modules/.bin/gltf-transform
for f in "$1"/*.glb; do
  $G meshopt "$f" "$f.tmp.glb" --level medium > /dev/null 2>&1 && mv "$f.tmp.glb" "$f" && echo "comprimido $(basename "$f") $(( $(stat -c %s "$f") / 1024 )) KB"
done
