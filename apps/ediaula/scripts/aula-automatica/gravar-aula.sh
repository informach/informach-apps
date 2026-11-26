#!/usr/bin/env bash
# Grava as partes pedidas de uma aula, uma de cada vez: ensaio num projeto novo, gravação (até 3 tentativas)
# e pacote "Parte N - Projeto EdiAula.zip" na pasta da parte. Uma parte cujo ensaio não passa inteiro não é
# gravada: o motivo fica em <parte>/edicao/ensaio.log.
# Uso: gravar-aula.sh <curso> <aula> <parte> [<parte> ...]
# Precisa do condutor do EdiAula aberto (condutor.mts ediaula) e do palco já com a conta da equipe no perfil.
# Faz uma coisa por vez: não rode edição no mesmo condutor enquanto grava.
set -uo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI"
CURSO="$1"; A="$2"; shift 2
for n in "$@"; do
  echo "=== $CURSO Aula $A Parte $n $(date +%H:%M:%S)"
  ED="$(./parte.sh "$CURSO" "$A" "$n" info | python -X utf8 -c "import json,sys; print(json.load(sys.stdin)['edicao'])")" || continue
  mkdir -p "$ED"
  P="$(./parte.sh "$CURSO" "$A" "$n" info | python -X utf8 -c "import json,sys; print(json.load(sys.stdin)['projeto'])")"
  if [ -f "$P" ] && python -X utf8 -c "
import json, sys
sys.exit(0 if json.load(open(sys.argv[1], encoding='utf8')).get('clips') else 1)" "$P"; then
    echo "Parte $n já tem uma tomada em $P: renomeie o projeto para \"(tomada de <data>)\" antes de gravar de novo"
    continue
  fi
  ./parte.sh "$CURSO" "$A" "$n" ensaio > "$ED/ensaio.log" 2>&1
  tail -1 "$ED/ensaio.log"
  if ! tail -3 "$ED/ensaio.log" | grep -q "Todas as etapas funcionaram"; then
    echo "Parte $n: o ensaio não passou inteiro; não gravei (veja $ED/ensaio.log)"
    continue
  fi
  for tentativa in 1 2 3; do
    ./parte.sh "$CURSO" "$A" "$n" gravar > "$ED/gravar.log" 2>&1
    if python -X utf8 -c "
import json, sys
r = json.load(open(sys.argv[1], encoding='utf8')).get('result', {})
print('resultado:', r.get('duracao'), r.get('parou', ''), '|', ' / '.join(r.get('verificacao', []))[:300])
sys.exit(0 if r.get('duracao') else 1)" "$ED/gravacao.log"; then break; fi
    if [ "$tentativa" = 3 ]; then echo "Parte $n não gravou em 3 tentativas: não empacotei"; continue 2; fi
    # A tentativa que falhou deixou clipes no projeto: o ensaio seguinte cria um projeto limpo.
    ./parte.sh "$CURSO" "$A" "$n" ensaio > "$ED/ensaio.log" 2>&1
  done
  # Cada gesto na palavra dele, e o jogo fazendo o que a fala diz: a tabela e a folha de quadros ficam em
  # <parte>/edicao/sincronia.md e sincronia-jogo.jpg. Fora da tolerância, a parte não é empacotada.
  if ! python -X utf8 edicao/sincronia.py "$CURSO" "$A" "$n"; then
    echo "Parte $n: gesto fora da palavra (veja $ED/sincronia.md); não empacotei"
    continue
  fi
  echo "Parte $n: confira os quadros do jogo em $ED/sincronia-jogo.jpg antes de editar"
  ./parte.sh "$CURSO" "$A" "$n" empacotar 2>&1 | tail -1
done
echo "=== fim $(date +%H:%M:%S)"
