#!/bin/bash
# Animações compostas: compõe, corrige (mão no corpo, assento/cama), junta à biblioteca e corrige chão e antebraço.
# Uso: [SO=id1,id2] bash tools/compostos.sh corpo1 corpo2 ...   (SO: só essas receitas; as outras ficam como estão)
cd "$(dirname "$0")/.."
B=blender-venv/bin/python
mkdir -p biblioteca/compostos_bruto biblioteca/compostos
for c in "$@"; do
  $B -I tools/compor.py -- biblioteca/corrigido_todos/$c.blend $c biblioteca/compostos_bruto/$c.blend "$SO" > biblioteca/log_compor_$c.txt 2>&1
  grep -E "^fim|faltou|Error|Trace" biblioteca/log_compor_$c.txt
  $B -I tools/biblioteca_corrige.py -- biblioteca/compostos_bruto/$c.blend $c biblioteca/compostos/$c.blend biblioteca/compostos/$c.json > biblioteca/log_compostos_corrige_$c.txt 2>&1
  grep -E "^fim|Error|Trace" biblioteca/log_compostos_corrige_$c.txt
  python3 -I - "$c" <<'PY'
import json, sys
c = sys.argv[1]
j = json.load(open(f"biblioteca/compostos/{c}.json"))
extra = json.load(open(f"biblioteca/compostos_bruto/{c}_apoios.json"))
for k, v in extra.items():
    if k in j["apoios"] and "tipo" not in v:
        j["apoios"][k].update(v)       # ex.: assento medido + mesa
    else:
        j["apoios"][k] = v
json.dump(j, open(f"biblioteca/compostos/{c}.json", "w"), ensure_ascii=False, indent=1)
print("apoios", c, len(j["apoios"]))
PY
  IDS=$(python3 -I -c "import json;print(','.join(sorted(json.load(open('biblioteca/compostos_bruto/$c'+'_apoios.json')).keys()) ))")
  NOVAS=$(grep "^composta" biblioteca/log_compor_$c.txt | awk '{print $3}' | paste -sd,)
  $B -I tools/biblioteca_junta.py -- biblioteca/corrigido_todos/$c.blend biblioteca/compostos/$c.blend $c biblioteca/corrigido_todos/$c.blend 2>&1 | grep -E "^fim|Error|Trace"
  $B -I tools/biblioteca_chao.py -- biblioteca/corrigido_todos/$c.blend $c "$NOVAS" 2>&1 | grep -E "^fim|Error|Trace"
  $B -I tools/biblioteca_antebraco.py -- biblioteca/corrigido_todos/$c.blend $c "$NOVAS" 2>&1 | grep -E "^fim|Error|Trace"
done
echo FIMCOMP
