#!/bin/bash
# Animações de gravidez e parto: compõe sobre a biblioteca de grávida, junta, corrige chão e antebraço e exporta.
cd "$(dirname "$0")/.."
B=blender-venv/bin/python
mkdir -p biblioteca/gravida_comp
for c in adulta plus_f atletica; do
  $B -I tools/compor_gravida.py -- biblioteca/gravida/$c.blend $c biblioteca/gravida_comp/$c.blend 2>&1 | grep -E "composta|faltou|^fim|Error|Trace"
  $B -I tools/biblioteca_junta.py -- biblioteca/gravida/$c.blend biblioteca/gravida_comp/$c.blend $c biblioteca/gravida/$c.blend 2>&1 | grep -E "^fim|Error|Trace"
  python3 -I - "$c" <<'PY'
import json, sys
c = sys.argv[1]; p = f"biblioteca/gravida/{c}.json"; j = json.load(open(p))
ap = j["apoios"]
for novo, base in (("resident.parto.contracao_deitada", "resident.lie.idle"), ("resident.gravida.lie_side", "resident.lie.idle"),
                   ("resident.gravida.sit_slow", "resident.sit.chair.enter"), ("resident.gravida.stand_slow", "resident.sit.chair.exit")):
    if base in ap:
        ap[novo] = ap[base]
json.dump(j, open(p, "w"), ensure_ascii=False, indent=1)
print("apoios", c, len(ap))
PY
  NOVAS=resident.gravida.belly_hold,resident.gravida.back_hold,resident.gravida.sit_slow,resident.gravida.stand_slow,resident.gravida.lie_side,resident.parto.contracao_pe,resident.parto.contracao_deitada
  $B -I tools/biblioteca_chao.py -- biblioteca/gravida/$c.blend $c "$NOVAS" 2>&1 | grep -E "^fim|Error|Trace"
  $B -I tools/biblioteca_antebraco.py -- biblioteca/gravida/$c.blend $c "$NOVAS" 2>&1 | grep -E "^fim|Error|Trace"
  FPS=15 $B -I tools/biblioteca_exporta.py -- biblioteca/gravida/$c.blend $c biblioteca/glb/${c}_gravida.glb 2>&1 | grep -E "^fim|Error|Trace"
  FPS=30 $B -I tools/biblioteca_exporta.py -- biblioteca/gravida/$c.blend $c biblioteca/glb30/${c}_gravida.glb 2>&1 | grep -E "^fim|Error|Trace"
done
python3 -I tools/biblioteca_pacote.py "$PWD"
echo FIMGRAVCOMP
