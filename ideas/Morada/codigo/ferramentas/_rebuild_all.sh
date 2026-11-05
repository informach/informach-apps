#!/bin/bash
# Reconstrói todas as bibliotecas a partir do que saiu do Mixamo convertido (bruto), com todas as correções.
cd "$(dirname "$0")/.."
B=blender-venv/bin/python
for c in adulto plus_m plus_f musculoso atletica alto_magro idoso adolescente_m crianca_m pequeno_m bebe_m; do
  echo "== $c"
  $B -I tools/biblioteca_corrige.py -- biblioteca/bruto/$c.blend $c biblioteca/corrigido/$c.blend biblioteca/corrigido/$c.json 2>&1 | grep -E "^fim|Error|Trace"
  if [ -f biblioteca/bruto_p2/$c.blend ]; then
    $B -I tools/biblioteca_corrige.py -- biblioteca/bruto_p2/$c.blend $c biblioteca/corrigido_p2/$c.blend biblioteca/corrigido_p2/$c.json 2>&1 | grep -E "^fim|Error|Trace"
  fi
  $B -I tools/biblioteca_junta.py -- biblioteca/corrigido/$c.blend biblioteca/corrigido_p2/$c.blend $c biblioteca/corrigido_todos/$c.blend 2>&1 | grep -E "^fim|virada|Error|Trace"
  if [ "$c" = pequeno_m ]; then $B -I tools/pequeno_corrige.py -- biblioteca/corrigido_todos/$c.blend $c 2>&1 | grep -E "^fim|Error|Trace"; fi
  $B -I tools/biblioteca_chao.py -- biblioteca/corrigido_todos/$c.blend $c 2>&1 | grep -E "^fim|Error|Trace"
  $B -I tools/biblioteca_antebraco.py -- biblioteca/corrigido_todos/$c.blend $c 2>&1 | grep -E "^fim|Error|Trace"
  bash tools/_rb_comp.sh $c 2>&1 | grep -E "^fim .* \[|faltou|Error|Trace"
  $B -I tools/lista_dup.py -- biblioteca/corrigido_todos/$c.blend 2>&1 | grep DUP
  FPS=15 $B -I tools/biblioteca_exporta.py -- biblioteca/corrigido_todos/$c.blend $c biblioteca/glb/$c.glb 2>&1 | grep -E "Error|Trace|^fim"
  FPS=30 $B -I tools/biblioteca_exporta.py -- biblioteca/corrigido_todos/$c.blend $c biblioteca/glb30/$c.glb 2>&1 | grep -E "Error|Trace|^fim"
done
echo "== grávida"
bash tools/_rb_g1.sh && bash tools/_rb_g2.sh && bash tools/_rb_g3.sh
echo FIMTUDO
