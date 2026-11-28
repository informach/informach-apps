#!/usr/bin/env bash
# Etapas de uma parte. Uso: parte.sh <curso> <aula> <parte> <etapa> [opções]
#   info        mostra o que o config.json resolve para a parte (projeto, palco, roteiro, voz, pastas)
#   palco       entra no palco com a conta da equipe (uma vez por perfil)
#   plataforma  entra na janela da aula com a conta de ensaio da parte (aula que grava a própria plataforma)
#   ensaio      projeto novo, roteiro, voz, plano gerado e ensaio seco (Verificar plano); não grava
#   gravar      grava a parte já ensaiada, registrando os contornos dos alvos (edicao/caixas.json)
#   empacotar   empacota o projeto gravado em "Parte N - Projeto EdiAula.zip" na pasta da parte
#   decisoes    lista de decisões (edicao/decisoes.json e .txt): ação, explicação, conceito, personagens
#   frases      as frases da voz no segundo da linha do tempo da edição (já com o atraso da narração na
#               gravação): use estes segundos nos trechos das animações e no lugar dos personagens
#   montar      comandos de zoom, marcações e capa (edicao/comandos.json), com as peças .edisvg de <parte>/pecas
#               no lugar das anotações geradas; opção: '[[ini, fim], ...]' das animações
#   copia       copia o projeto gravado para "<projeto> · edição automática" (a edição vai na cópia)
#   aplicar     aplica edicao/comandos.json na cópia aberta no EdiAula e renderiza as peças .edisvg no condutor
#               do EdiSVG; opção: --sem-zoom
#   acabamento  animações no lugar da tela, planos da apresentadora, personagens, faixas e música
#   revisao     limpeza final e verificação antes de exportar; escreve edicao/relatorio.md
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
  plataforma)
    # Aula que grava a própria plataforma: entra na janela da aula com a conta de ensaio da parte.
    "$C" acao entrar-na-plataforma.mjs "$(python -X utf8 -c "import json,sys; c=json.loads(sys.argv[1]); p=c['plataforma']; assert p, 'esta parte não tem conta de plataforma no config.json'; print(json.dumps({'plataforma': p}, ensure_ascii=False))" "$CFG")" ;;
  ensaio)
    "$C" estado "$(python -X utf8 -c "import json,sys; c=json.loads(sys.argv[1]); c.update(soVerificar=True, curso=c['cursoEdiAula']); print(json.dumps(c, ensure_ascii=False))" "$CFG")" >/dev/null
    "$C" acao novo-projeto.mjs >/dev/null
    "$C" acao roteiro.mjs >/dev/null
    TIMEOUT=1800 "$C" acao fazer-parte.mjs | python -X utf8 -c "
import json,sys; d=json.load(sys.stdin); r=d.get('result') or d
print(r.get('gerado') if isinstance(r,dict) else r); print(len(r.get('etapas',[])),'etapas'); print('\n'.join(r.get('verificacao',[])))" ;;
  gravar)
    # A parte pedida, não a do último ensaio: o estado do condutor guarda a parte, a aula e a voz
    # de quem passou por ele por último (Ilha A2, 22/11/2026: ensaiadas as seis partes, o estado
    # ficava na Parte 6). O projeto da parte é aberto, e um que já tem tomada fica como está
    # (uma tomada por projeto: renomeie o antigo para "(tomada de …)" antes de gravar de novo).
    P="$(v projeto)"
    [ -f "$P" ] || { echo "a parte ainda não tem projeto: rode o ensaio primeiro ($P)" >&2; exit 1; }
    python -X utf8 -c "
import json, sys
n = len(json.load(open(sys.argv[1], encoding='utf8')).get('clips', []))
sys.exit(f'o projeto já tem uma tomada ({n} clipes): renomeie-o antes de gravar de novo' if n else 0)" "$P"
    "$C" estado "$(python -X utf8 -c "import json,sys; c=json.loads(sys.argv[1]); c.update(soVerificar=False, curso=c['cursoEdiAula'], caixasEtapa='ligar', caixasMin=30); print(json.dumps(c, ensure_ascii=False))" "$CFG")" >/dev/null
    "$C" acao abrir-projeto.mjs "$(python -X utf8 -c "import json,sys; print(json.dumps({'arquivo': sys.argv[1]}, ensure_ascii=False))" "$P")" >/dev/null
    # Toda a saída da sonda fora do terminal: senão ela prende o pipe de quem chamou até o TIMEOUT dela.
    TIMEOUT=1900 "$C" acao sonda-caixas.mjs >/dev/null 2>&1 &
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
  frases)
    T="$(python -X utf8 "$AQUI/edicao/transcricao.py" "$(v perfil)" "$(v voz)")"
    G="$(cat "$ED/gravacao.txt" 2>/dev/null || true)"
    python -X utf8 "$AQUI/edicao/frases.py" "$T" "$G" ;;
  montar)
    ANIM="${1:-[]}"; echo "$ANIM" > "$ED/animacoes.json"
    python -X utf8 "$AQUI/edicao/montar.py" "$ED/decisoes.json" "$ED/caixas.json" "$ED/comandos.json" --animacoes "$ANIM" | grep -E "^(apresentadora|revisar|[0-9]+ comandos)"
    CAPA="$(python -X utf8 -c "import json,sys; c=json.loads(sys.argv[1]); print(json.dumps({'kicker': f\"AULA {c['aulaN']} · PARTE {c['parte']}\", 'title': c.get('tituloCapa') or c['titulo'], 'subtitle': c['subtituloCapa']}, ensure_ascii=False))" "$CFG")"
    python -X utf8 "$AQUI/edicao/pecas.py" "$ED/comandos.json" "$(v pasta)/pecas" --animacoes "$ANIM" --capa "$CAPA" ;;
  aplicar)
    "$AQUI/edicao/aplicar.sh" "$ED/comandos.json" "$(python -X utf8 -c "import sys; print(sys.argv[1][:-len('.ediaula')] + ' · edição automática.ediaula')" "$(v projeto)")" "${1:-}"
    # Os pedidos de vínculo chegam juntos ao EdiSVG, e só o último vira render: as peças sem render são
    # abertas e salvas uma de cada vez no condutor do EdiSVG.
    # As janelas que os pedidos de vínculo abrem registram o vínculo (o vinculos.json) e seguram a peça: a janela do
    # condutor não consegue abrir a mesma peça ("não abriu") e a peça refeita ficava sem render (Cadê A2P4 e A3P2,
    # 28/11/2026). Depois de os pedidos registrarem os vínculos, essas janelas fecham e o condutor renderiza.
    ping -n 9 127.0.0.1 >/dev/null
    fechar_pedidos() {
      powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Where-Object { \$_.CommandLine -match 'apps.edisvg' -and \$_.CommandLine -match '--pedido' -and \$_.CommandLine -notmatch '--type=' } | ForEach-Object { taskkill /PID \$_.ProcessId /T /F | Out-Null; 1 } | Measure-Object | ForEach-Object { if (\$_.Count) { 'janelas de pedido do EdiSVG fechadas: ' + \$_.Count } }" 2>/dev/null || true
    }
    fechar_pedidos
    PECAS="$(python -X utf8 -c "import glob,json,os,sys; print(json.dumps({'semPedido': True, 'svgArquivos': sorted(p.replace(os.sep, '/') for p in glob.glob(os.path.join(sys.argv[1], '*.edisvg')))}, ensure_ascii=False))" "$(v pasta)/pecas")"
    TIMEOUT=1800 "$C" --svg acao renderizar-pecas.mjs "$PECAS" | python -X utf8 -c "
import json, sys
r = json.load(sys.stdin).get('result') or {}
print(len(r.get('renderizadas', [])), 'peças renderizadas agora |', len(r.get('ja_tinham', [])), 'já tinham render')
[print('falhou:', f) for f in r.get('falharam', [])]"
    fechar_pedidos ;;
  copia)
    python -X utf8 "$AQUI/edicao/copiar_projeto.py" "$(v projeto)" ;;
  acabamento)
    E="$(python -X utf8 -c "
import json, os, sys
c = json.loads(sys.argv[1]); ed = sys.argv[2]
musica = os.path.splitext(os.path.basename(c['musica']))[0] if c.get('musica') else None
print(json.dumps({'projeto': c['projeto'][:-len('.ediaula')] + ' · edição automática.ediaula',
                  'intervalos': json.load(open(os.path.join(ed, 'comandos-apresentadora.json'))),
                  # O vídeo da apresentadora DESTA parte: o estado do condutor guarda o do último ensaio.
                  'apresentadora': c['apresentadora'],
                  # Frases gravadas depois e emendadas na voz (edicao/emendas.json), que o HeyGen não tem.
                  **({'emendas': json.load(open(os.path.join(ed, 'emendas.json')))} if os.path.exists(os.path.join(ed, 'emendas.json')) else {}),
                  **({'musica': musica} if musica else {})}, ensure_ascii=False))" "$CFG" "$ED")"
    TIMEOUT=1800 "$C" acao acabamento.mjs "$E" | python -X utf8 -c "
import json, sys
d = json.load(sys.stdin); r = d.get('result')
if not isinstance(r, dict): print(d.get('error') or d); sys.exit(1)
json.dump(r, open(sys.argv[1], 'w', encoding='utf8'), ensure_ascii=False, indent=1)
[print(x) for x in r['feito'][-4:]]; [print('revisar:', x) for x in r['revisar']]" "$ED/acabamento.json" ;;
  revisao)
    E="$(python -X utf8 -c "import json,sys; c=json.loads(sys.argv[1]); print(json.dumps({'projeto': c['projeto'][:-len('.ediaula')] + ' · edição automática.ediaula', 'edicao': c['edicao']}, ensure_ascii=False))" "$CFG")"
    TIMEOUT=1800 "$C" acao revisao-final.mjs "$E" | python -X utf8 -c "
import json, sys
d = json.load(sys.stdin); r = d.get('result')
if not isinstance(r, dict): print(d.get('error') or d); sys.exit(1)
print('relatório:', r['relatorio']); print(len(r['revisar']), 'pontos para revisar |', len(r['verificacao']), 'da verificação')" ;;
  *) sed -n '2,18p' "$0"; exit 2 ;;
esac
