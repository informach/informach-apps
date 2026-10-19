# Edi Desktop

Integração desktop compartilhada por Hub, EdiAula, EdiCaptura, EdiFoto, EdiPDF e EdiSVG. Consulte o [padrão desktop](../../docs/arquitetura-desktop.md) e o [guia de desenvolvimento](../../docs/desenvolvimento-edi.md). Código TypeScript fonte é consumido pelos subpaths explícitos de `package.json`; o package não publica `dist` próprio.

## Ponte Windows de captura

`@informach/edi-desktop/windows-capture` fornece infraestrutura **somente main**, sem registrar IPC nem conceder licença. O app valida autorização, janela/frame/origem e schemas IPC antes de invocá-la. Não importar no renderer/preload. EdiCaptura consome as consultas em `capture-sources.ts`/`capture-pipeline.ts` e as ações explicitamente autorizadas em `scroll-automation.ts`; o app conserva tokens, licença, região e ciclo de vida.

| API | Contrato |
| --- | --- |
| `prepareWindowsCapture(signal?)` | Compila uma vez por sessão e aguarda READY; retorna `query`, `close`, `preparationMs`. Uma operação pendente por vez (`NATIVE_BUSY` para concorrência), prazo de 15 s por resposta e abort que encerra o filho. O chamador fecha a sessão ao concluir/cancelar. |
| `nativeForeground(signal?)` | Janela ativa elegível, handle e identidade de proprietário, bounds físicos visíveis DWM |
| `nativeWindowBounds(handle, signal?)` | Mesmo contrato para handle decimal explícito; minimizadas, invisíveis, cloaked e destruídas falham |
| `nativeEligibleWindows(handles, signal?)` | Filtra até 128 handles candidatos obtidos do catálogo de fontes Electron; não varre títulos nem processos |
| `nativeControls(handle, signal?)` | Até 256 HWNDs filhos visíveis; bounds físicos, sem texto, valores, senha ou UI Automation semântica |
| `nativeCursor(signal?)` | Posição física e hotspot, dimensões e dois PNGs base64 (`blackPng`/`whitePng`); oculto retorna imagens nulas |
| `assertNativeTarget(expected, actual)` | Rejeita mudança de handle, proprietário, posição ou tamanho |
| `query({op:"focus", target})` | Tenta ativar uma vez a janela explicitamente autorizada; devolve `{window, focused}` validado. `focused:false` é ativação ainda não confirmada, não mudança de alvo; o app deve aguardar ativação explícita sem roda. Identidade/bounds alterados continuam falhando. |
| `query({op:"wheel", target, region, axis, delta})` | Região física contida no alvo, eixo vertical/horizontal e delta ±120. Revalida identidade/bounds, foreground e WindowFromPoint/IsChild. SendMessageTimeout dirigido ao HWND elegível, prazo 200 ms; não usa SendInput global nem altera o cursor. |
| `queryWindowsCapture(request, options?)` | União fechada das ações acima; `signal`, timeout padrão 15 s, máximo 30 s |

A identidade contém somente HWND/PID/TID do alvo, sem título, caminho de processo ou conteúdo. Ela detecta troca de proprietário, mas não é uma identidade persistente: um HWND pode ser reutilizado pelo mesmo processo/thread. Reconsultar imediatamente antes/depois da captura e interromper ao mudar o alvo. Resultados vazios de controles significam ausência de HWNDs filhos detectáveis; interfaces desenhadas em canvas/Chromium não ganham controles fictícios.

Bounds nativos são **pixels físicos**, com `SetThreadDpiAwarenessContext(-4)` restaurado em `finally`; janelas usam DWM extended-frame bounds e filhos usam `GetWindowRect` no contexto DPI explícito. Electron `Display.bounds` é DIP. O consumidor deve usar a conversão Windows de `screen.screenToDipRect`/`screen.screenToDipPoint`, não multiplicar uma origem DIP por `scaleFactor`. A enumeração recorta filhos contra o frame visível do pai e a client area de cada ancestral, omite áreas vazias e rejeita árvores alteradas. O consumidor ainda recorta contra a imagem capturada e converte para DIP/saída.

O cursor é desenhado sobre preto e branco, preservando inclusive a inversão de cursores AND/XOR. Após decodificar os dois PNGs, cada canal sobre o pixel de fundo `d` usa `black + (white - black) * d / 255`; a posição de desenho subtrai o hotspot antes da conversão para o espaço de saída. O compositor de referência está em `apps/edicaptura/src/domain/capture-cursor.ts`; não importar o app a partir deste package.

A ponte executa Windows PowerShell do diretório do sistema com código fixo incorporado, compilado por `Add-Type`; a API simples cria um processo por consulta e a API preparada o conserva por sessão, sem cache em disco. Um bootstrap curto e fixo recebe primeiro o código incorporado em base64 por stdin, evitando o teto de linha de comando do Windows. Esse primeiro frame é produzido exclusivamente pelo package, nunca pelo request/renderer; depois seguem requests JSON validados. A codificação UTF-8 é definida uma única vez antes da leitura, para não invalidar bytes já bufferizados. Não aceita comandos, scripts, paths ou executáveis do chamador e não reutiliza um cache compilado gerenciado pelo app. A saída é limitada e validada, mensagens de falha têm códigos fechados, e cancelamento/timeout encerram o filho e rejeitam resultados tardios. `windowsPowerShellEnvironment` corrige apenas o caminho de módulos herdado; não registra valores de ambiente. Progresso de autoload é desligado, erros continuam fatais.

Fora do Windows, a operação falha com `WINDOWS_UNAVAILABLE`. Ausência de DWM/contexto DPI/cursor/janela retorna erro explícito. Não há fallback com DPI presumido, comandos arbitrários, mudança de proteção ou coleta de conteúdo pessoal.

## Verificação

`pnpm --filter @informach/edi-desktop test` e `typecheck` verificam o package. `pnpm --filter @informach/edicaptura test:capture-native` exige Windows e cria uma janela WinForms sintética com botão; verifica bounds/filhos/foreground, cursor, mudança/fechamento do alvo, abort e timeout. Não grava desktop nem usa clipboard. A janela pode aparecer brevemente para verificar APIs reais; sua ausência não é convertida em skip/sucesso. O teste não equivale ao harness comercial licenciado nem a homologação física de múltiplos monitores, HDR, dock ou suspensão. Gate funcional completo permanece na etapa 4d.

A preparação pode custar perto de um segundo nesta estação; a contagem da captura começa depois de READY. Consulta e imagem não são atômicas. A integração amostra o cursor logo após a aquisição, antes da composição em blocos, usando hotspot no espaço físico. Uma medida de fixture deu 892 ms de preparação e 86 ms na primeira consulta; isto não é um SLA. A fixture de foreground verifica a janela própria imediatamente após seu evento Shown. Uma execução anterior, que só verificava foreground após outras consultas/compilações, recebeu `activation-denied`; nenhuma política de ativação do Windows foi alterada. O serviço rejeita foreground indisponível sem adquirir pixels.


As ações de entrada não concedem autoridade por si: o app precisa receber autorização explícita da janela/eixo, emitir tokens efêmeros, converter a área com `screen.dipToScreenRect`, validar sessão/licença/topologia e abortar na pausa/perda de foco. `focus` só ocorre no início autorizado; a roda não recupera foco silenciosamente. Uma mensagem já entregue não pode ser revertida pelo abort. Input bruto, UIPI/apps elevados e aplicações sem suporte a mensagens de roda/horizontal podem impedir a automação; não existe fallback de entrada global. Coordenadas de ponto fora de Int16 são rejeitadas para não truncar o lParam. Reutilização de HWND pelo mesmo proprietário continua um limite.

`pnpm --filter @informach/edicaptura test:scroll-native` verifica o contrato de input com uma superfície WinForms sintética opaca própria nos dois eixos, cancelamento, perda de foco, região externa e janela movida. A fixture de captura/cursor anterior permanece obrigatória após mudanças na ponte. Fontes de referência: [WM_MOUSEWHEEL](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-mousewheel), [Mouse Input/WM_MOUSEHWHEEL](https://learn.microsoft.com/en-us/windows/win32/inputdev/mouse-input) e [transferência de ArrayBuffer nos workers Node](https://nodejs.org/api/worker_threads.html).

O Windows pode recusar uma ativação conforme os direitos do processo e a interação atual; uma transição também pode completar após a consulta imediata. O consumidor não deve repetir foco silenciosamente. EdiCaptura espera no máximo 30 segundos com consultas fechadas e canceláveis de bounds/foreground, depois requer nova autorização ou modo assistido. A fixture Node não comprova os direitos de um clique no controller Electron. Referência: [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow).

## Native media

`@informach/edi-desktop/native-media` é um export main-only, sem Electron/imports de apps. `resolveNativeMedia` recebe contexto de distribuição; builds instalados resolvem somente o próprio `resources/native-media/bin`. Desenvolvimento procura o bundle do workspace e permite fallback explicitamente injetado pelo consumidor legado EdiAula. Não faz downloads nem procura outras instalações.

`NativeMedia` concentra executor com identidade exclusiva por job, até4processos, stdout2MiB, cauda stderr8KB, prazo máximo1h e cancelamento que só resolve/rejeita após close; callbacks de streaming não acumulam stdout no executor. Probe limita a5min e lê timestamps incrementalmente se falta duração; `frame` gera quadro/miniatura com caminhos locais e argumentos fixos; encoder é detectado por execução real. EdiAula mantém cache/edição/transcrição no app. Captura mantém autorização, receita, origem, staging e licença no app. A capacidade `nativeMedia` em `@informach/config/edi-tools` governa a inclusão de executáveis/licenças/fonte/rebuild em cada pacote e notices; inventário assinado inclui esses arquivos. Cada app funciona independentemente da instalação dos demais.
