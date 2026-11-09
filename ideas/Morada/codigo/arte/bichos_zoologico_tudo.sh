#!/bin/bash
# Gera tudo: GLB + catálogo, folha geral, miniaturas e folhas de cada animação nova.
SP="$1"
cd "$SP"
export MOVEIS_THREADS=1
blender-venv/bin/python -I morada-art/bichos_zoologico.py -- "$SP/pets/zoologico" todos > "$SP/pets/zoologico/_log_export.txt" 2>&1 || { echo "ERRO export"; exit 1; }
grep "^bicho\|zmin': -0.0[1-9]\|zmin': -0.[1-9]\|desliza': 0.0[2-9]" "$SP/pets/zoologico/_log_export.txt"
echo "export ok"
AMOSTRAS=20 blender-venv/bin/python -I morada-art/bichos_zoologico_render.py -- folha "$SP/pets/zoologico/glb" "$SP/pets/zoologico/folha_todos.png" > /dev/null 2>&1 && echo "folha ok"
blender-venv/bin/python -I morada-art/bichos_zoologico_render.py -- minis "$SP/pets/zoologico/glb" "$SP/pets/zoologico" > /dev/null 2>&1 && echo "minis ok"
bash morada-art/bichos_zoologico_folhas.sh "$SP"
echo "tudo ok"
