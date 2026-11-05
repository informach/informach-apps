#!/bin/bash
# Refaz vassoura e rodo (pulso neutro, palmas para o cabo) em todos os corpos e reexporta; depois a grávida.
cd "$(dirname "$0")/.."
B=blender-venv/bin/python
for c in adulto plus_m plus_f musculoso atletica alto_magro idoso adolescente_m crianca_m pequeno_m bebe_m; do
  echo "== $c"
  SO=clean.mop,clean.sweep bash tools/_rb_comp.sh $c 2>&1 | grep -E "^fim|faltou|Error|Trace"
  FPS=15 $B -I tools/biblioteca_exporta.py -- biblioteca/corrigido_todos/$c.blend $c biblioteca/glb/$c.glb 2>&1 | grep -E "Error|Trace|^fim"
  FPS=30 $B -I tools/biblioteca_exporta.py -- biblioteca/corrigido_todos/$c.blend $c biblioteca/glb30/$c.glb 2>&1 | grep -E "Error|Trace|^fim"
done
echo "== grávida"
sed -n '/^mkdir -p biblioteca\/gravida$/,$p' tools/_rb_g1.sh > tools/_rb_g1_sem_dedos.sh
sed -i '1i cd "$(dirname "$0")/.."\nB=blender-venv/bin/python' tools/_rb_g1_sem_dedos.sh
bash tools/_rb_g1_sem_dedos.sh && bash tools/_rb_g2.sh && bash tools/_rb_g3.sh
echo FIMCABO
