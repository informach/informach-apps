cd "$(dirname "$0")/.."
B=blender-venv/bin/python
mkdir -p biblioteca/gravida
for par in adulta:adulto plus_f:plus_f atletica:atletica; do
  c=${par%%:*}; f=${par##*:}
  $B -I tools/gravida_biblioteca.py -- corpos/out/corpos.blend $c biblioteca/corrigido_todos/$f.blend biblioteca/gravida/$c.blend 2>&1 | grep -E "acoes|postura|maos|^fim|Error|Trace"
  $B -I tools/biblioteca_chao.py -- biblioteca/gravida/$c.blend $c 2>&1 | grep -E "^fim|Error|Trace"
  $B -I tools/biblioteca_antebraco.py -- biblioteca/gravida/$c.blend $c 2>&1 | grep -E "^fim|Error|Trace"
  FPS=15 $B -I tools/biblioteca_exporta.py -- biblioteca/gravida/$c.blend $c biblioteca/glb/${c}_gravida.glb 2>&1 | grep -E "^fim|Error|Trace"
  FPS=30 $B -I tools/biblioteca_exporta.py -- biblioteca/gravida/$c.blend $c biblioteca/glb30/${c}_gravida.glb 2>&1 | grep -E "^fim|Error|Trace"
done
echo FIMGRAVIDA
