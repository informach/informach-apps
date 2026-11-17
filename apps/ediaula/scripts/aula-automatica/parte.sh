#!/usr/bin/env bash
# Etapas de uma parte. Uso: parte.sh <curso> <aula> <parte> <etapa> [opções]
#   info        mostra o que o config.json resolve para a parte (projeto, palco, roteiro, voz, pastas)
#   palco       entra no palco com a conta da equipe (uma vez por perfil)
#   ensaio      projeto novo, roteiro, voz, plano gerado e ensaio seco (Verificar plano); não grava
#   gravar      grava a parte já ensaiada, registrando os contornos dos alvos (edicao/caixas.json)
#   empacotar   empacota o projeto gravado em "Parte N - Projeto EdiAula.zip" na pasta da parte
#   decisoes    lista de decisões (edicao/decisoes.json e .txt): ação, explicação, conceito, personagens
#   montar      comandos de zoom e anotações (edicao/comandos.json); opção: '[[ini, fim], ...]' das animações
#   copia       copia o projeto gravado para "<projeto> · edição automática" (a edição vai na cópia)
# O condutor do EdiAula precisa estar rodando (condutor.mts ediaula) para palco, ensaio, gravar e empacotar.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURSO="$1"; AULA="$2"; N="$3"; ETAPA="$4"; shift 4
CFG="$(python -X utf8 "$AQUI/config.py" "$CURSO" "$AULA" "$N")"
v() { python -X utf8 -c "import json,sys; print(json.loads(sys.argv[1])[sys.argv[2]])" "$CFG" "$1"; }
C="$AQUI/comando.sh"
ED="$(v edicao)"; mkdir -p "$ED"

ultima_gravacao() { # a gravação mais nova do perfil (a desta parte, logo depois de gravar)
  ls -td "$(v gravacoes)"/*/ | head -1 | sed 's#/$##'
}

case "$ETAPA" in
  info) echo "$CFG" ;;
  palco)
    "$C" acao entrar-no-palco.mjs "$(python -X utf8 -c "import json,sys; c=json.loads(sys.argv[1]); print(json.dumps({'aula': c['aula'], 'parte': c['parte'], 'credenciais': c['credenciais']}))" "$CFG")" ;;
  ensaio)
    "$C" estado "$(python -X utf8 -c "import json,sys; c=json.loads(sys.argv[1]); c.update(soVerificar=True, curso=c['cursoEdiAula']); print(json.dumps(c, ensure_ascii=False))" "$CFG")" >/dev/null
    "$C" acao novo-projeto.mjs >/dev/null
    "$C" acao roteiro.mjs >/dev/null
    TIMEOUT=1800 "$C" acao fazer-parte.mjs | python -X utf8 -c "
import json,sys; d=json.load(sys.stdin); r=d.get('result') or d
print(r.get('gerado') if isinstance(r,dict) else r); print(len(r.get('etapas',[])),'etapas'); print('\n'.join(r.get('verificacao',[])))" ;;
  gravar)
    "$C" estado '{"soVerificar": false, "caixasEtapa": "ligar", "caixasMin": 30}' >/dev/null
    TIMEOUT=1900 "$C" acao sonda-caixas.mjs >/dev/null &
    SONDA=$!
    TIMEOUT=2400 "$C" acao fazer-parte.mjs > "$ED/gravacao.log"
    kill "$SONDA" 2>/dev/null || true
    "$C" estado '{"caixasEtapa": "ler"}' >/dev/null
    "$C" acao sonda-caixas.mjs | python -X utf8 -c "import json,sys; print(json.load(sys.stdin)['result'])" > "$ED/caixas.json"
    G="$(ultima_gravacao)"; echo "$G" > "$ED/gravacao.txt"
    echo "gravação: $G"; python -X utf8 -c "import json,sys; r=json.load(open(sys.argv[1],encoding='utf8')).get('result',{}); print(r.get('duracao'), r.get('parou',''))" "$ED/gravacao.log" ;;
  empacotar)
    "$C" acao abrir-projeto.mjs "$(python -X utf8 -c "import json,sys; print(json.dumps({'arquivo': json.loads(sys.argv[1])['projeto']}, ensure_ascii=False))" "$CFG")"
    Z=$(TIMEOUT=900 "$C" acao empacotar.mjs | python -X utf8 -c "import json,sys; print(json.load(sys.stdin)['result']['zip'] or '')")
    [ -n "$Z" ] || { echo "o EdiAula não disse onde salvou o pacote" >&2; exit 1; }
    Z="$(cygpath -u "$Z" 2>/dev/null || echo "$Z")"; P="$(v pacote)"
    if [ -f "$P" ]; then mkdir -p "$(dirname "$P")/Versão anterior"; mv "$P" "$(dirname "$P")/Versão anterior/"; fi
    mv "$Z" "$P" && ls -la "$P" ;;
  decisoes)
    G="$(cat "$ED/gravacao.txt" 2>/dev/null || ultima_gravacao)"
    T="$(python -X utf8 "$AQUI/edicao/transcricao.py" "$(v perfil)" "$(v voz)")"
    python -X utf8 "$AQUI/edicao/decisoes.py" "$G" "$T" "$(v roteiro)" "$N" "$ED/decisoes.json" > "$ED/decisoes.txt"
    head -3 "$ED/decisoes.txt"; echo "lista completa em $ED/decisoes.txt" ;;
  montar)
    python -X utf8 "$AQUI/edicao/montar.py" "$ED/decisoes.json" "$ED/caixas.json" "$ED/comandos.json" --animacoes "${1:-[]}" | head -1 ;;
  copia)
    python -X utf8 "$AQUI/edicao/copiar_projeto.py" "$(v projeto)" ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
