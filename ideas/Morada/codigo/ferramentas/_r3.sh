#!/bin/bash
cd "$(dirname "$0")/.."
B=blender-venv/bin/python
for c in adulta plus_f atletica; do
  $B -I tools/tira_acoes.py -- biblioteca/gravida/$c.blend resident.care. 2>&1 | grep tiradas
  $B -I tools/limpa_dup.py -- biblioteca/gravida/$c.blend 2>&1 | grep limpo
  FPS=15 $B -I tools/biblioteca_exporta.py -- biblioteca/gravida/$c.blend $c biblioteca/glb/${c}_gravida.glb 2>&1 | grep -E "^fim|Error|Trace"
  FPS=30 $B -I tools/biblioteca_exporta.py -- biblioteca/gravida/$c.blend $c biblioteca/glb30/${c}_gravida.glb 2>&1 | grep -E "^fim|Error|Trace"
done
python3 -I tools/biblioteca_pacote.py "$PWD"
echo FIMFINAL
