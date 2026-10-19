# Base comum EdiCaptura, EdiAula e EdiPDF — proposta de 19/10/2026

O titular pediu, em 19/10/2026, uma análise conjunta de EdiCaptura, EdiAula e EdiPDF antes de retomar o Captura. Os trabalhos foram interrompidos para isso. O objetivo declarado é ter **ferramentas robustas, eficientes e inteligentes, sem repetir código**. Este documento propõe o código comum e a ordem da retomada. As decisões foram aprovadas pelo titular no mesmo dia (ver abaixo).

Base examinada: `main` em `23e9b1d1`, com o PR #24 do Captura já integrado. Complementa a [continuidade Captura/PDF](continuidade-edicaptura-edipdf.md), o [foco na suíte](foco-na-suite.md) e a [decisão de IA](decisao-ia-assinatura.md). A divisão de responsabilidade entre os apps continua a do foco na suíte.

## Regras da extração

1. **Regra dos dois consumidores.** Um código só vai para um package quando dois apps o usam de fato, e a extração acontece na mesma mudança que migra os dois. Não criar package "para o futuro".
2. **Extrair da versão mais endurecida.** Quando há cópias divergentes, a base é a mais robusta, nunca a mais simples. As outras cópias são apagadas e passam a consumir o package.
3. **O primeiro consumidor migrado é o app que já tinha o código.** Os testes dele precisam continuar passando sem mudança de comportamento antes de o Captura usar o package.
4. **Cada instalador continua autossuficiente.** O package entra no build. Modelos, wasm e binários são copiados para os recursos de cada app, e nenhum app procura nada na instalação de outro.
5. Ficam nos apps: domínio, UI, formato de projeto e fila específica (camada de texto do PDF, timeline do Aula, cenas/biblioteca/máscaras do Captura).

## Diagnóstico da duplicação atual

| Área | Situação hoje | Problema |
| --- | --- | --- |
| IA por assinatura (Claude Code/Codex + MCP local) | Três implementações divergentes: `apps/ediaula/src/main/{engines,engineArgs,engineRun,aiSettings,mcpServer,aiBridge}.ts` (a mais endurecida), `apps/edifoto/src/main/{engines,aiSettings,clientProcess,mcpServer,mcpBody,aiBridge}.ts` e `apps/edisvg/src/main/{engines,mcpServer,aiBridge}.js`. No package, só `access` e `mcp-config`. | O EdiFoto passa o prompt em argv e não usa run token. O MCP do EdiFoto não aplica guarda por ferramenta. Uma correção no EdiAula não chega aos outros. O Captura seria a quarta cópia. |
| Executor FFmpeg | `NativeMedia` em `packages/edi-desktop/src/native-media.ts` (usado pelo Captura) e outro executor/probe/frame/detecção de encoder em `apps/ediaula/src/main/ffmpeg.ts`, além de uma terceira chamada em `encoders.ts`. | Mesmo parse de progresso e de stderr em dois lugares. O package tem timeout e limite de saída que o Aula não tem; o Aula tem ids de job, scheduler e `onStderr`, que o package não tem. |
| Protocolo de mídia com Range | `apps/edicaptura/src/main/video-stream.ts` (capabilities revogáveis) e `media://` em `apps/ediaula/src/main/index.ts` (~267–330, sem capability). | A versão do Aula é menos restrita. |
| Medidores de áudio e plano de disco | `apps/ediaula/src/shared/recordingHealth.ts` (puro). O Captura vai precisar do mesmo na 5c. | Seria copiado. |
| Áudio do PC | `apps/ediaula/src/shared/systemAudio.ts`, `renderer/src/recorder/systemAudio.ts` (Chromium) e `native/helper/AudioLoopback.cs` (WASAPI, exclui a árvore do app). | Seria copiado. |
| OCR | Só no EdiPDF: `src/shared/ocr-format.ts`, `src/renderer/src/lib/{ocr,ocr-worker}.ts` e os modelos em `resources/ocr`. | O Captura precisa da mesma base na fase 6. |
| Win32 | Três mecanismos: `ediaula-helper.exe` (C# compilado), C# via PowerShell `Add-Type` em `edi-desktop/windows-capture` e PowerShell próprio em `apps/edicaptura/src/main/windows-file-clipboard.mts` (sem `windowsPowerShellEnvironment`). | Cursor e janela em foco implementados duas vezes. O EdiAula saiu do PowerShell por AppLocker/Defender, mas o Captura ainda depende dele. |
| Journal de gravação | JSONL multi-fonte FFmpeg no Aula; partes com ACK de um único WebM no Captura. | **Não é duplicação a remover.** Os modelos são diferentes e ambos foram revisados. Não unificar. |

## Packages propostos

### 1. IA local: `@informach/edi-desktop/ai-clients` e `/mcp-server`

Subpaths main-only do SDK desktop, ao lado de `access` e `mcp-config`, que já pertencem a ele.

- **`ai-clients`**: localizar e verificar clientes oficiais (`locateClient`, `clientStatus`); argumentos e ambiente (`engineArgs`: `resolveLaunch`, `claudeArgs`, `codexArgs`, `engineEnv`, `codexGuard`, `resumeGate`, one-shot); execução (`engineRun`: spawn sem shell, prompt por stdin, JSONL, `done` único, revogação do token no cleanup); `killTree`; núcleo de sessões por conversa e run token renovável de `engines.ts`; fila de aprovação e ponte main→renderer com timeout (`aiApproval`, `aiBridge` genérico, `toolQueue`). Nome do servidor MCP, porta, variável do token e prompt do painel entram por parâmetro.
- **`mcp-server`**: shell HTTP em 127.0.0.1 com `authorizeLocalMcp`, recusa de Origin/Host, StreamableHTTP sem estado, corpo limitado, guarda por escopo e por ferramenta. Recebe um registro de ferramentas.
- **Fica em cada app**: catálogo de ferramentas e guia do editor (`apps/ediaula/src/shared/aiTools.ts`, equivalentes do EdiFoto/EdiSVG e, depois, do Captura), prompts, caminhos e regras de domínio.
- **Consumidores na extração**: EdiAula (origem) e EdiFoto. O EdiSVG migra em seguida. O Captura entra no lote 8, cumprindo a decisão de IA: sem opção de API nem créditos Edi. A opção de API existente no EdiAula continua no app ou fica desligável por parâmetro.

### 2. Mídia: evoluir `@informach/edi-desktop/native-media` e criar `/media-range`

- Um único executor FFmpeg no `NativeMedia`, com os recursos dos dois lados: timeout, limite de saída, ids de job e grupos `<id>:<parte>`, `onStderr`, `capture: "stderr"`, `MediaProcessError` com detalhe e um gancho `onSpawn` para prioridade. O EdiAula configura o executor para sua fila (sem teto de processos ou de tempo, IDs compartilhados, mensagem "Cancelado") e apagou `run`/`cancel`/`probe` locais; mantém scheduler, proxy, waveform, exportação e a cadeia `encoderChoice`.
- **`media-range`**: o tratamento estrito de `Range` (`byteRange`, `rangeHeaders`, `rangeNotSatisfiable`), a partir do Captura. O `media://` do EdiAula passou a usá-lo e deixou de aceitar intervalos malformados. A autorização continua em cada app (tokens revogáveis no Captura, concessões de `desktopFiles` no EdiAula): trocar o modelo de URL do EdiAula por tokens mexeria em todo o renderer dele sem ganho de segurança proporcional.
- Fora deste subpath: os journals de gravação (ver diagnóstico).

### 3. Áudio: `@informach/edi-desktop/audio` (puro) e `/audio-capture` (renderer)

Necessário para a 5c.

- **`audio`** (sem Electron e sem DOM): `pcmLevels`, `dbfs`, `SilenceMeter`, `ClipMeter`, `diskPlan` (de `recordingHealth.ts`) e a política de áudio do PC (`systemAudioPlan`, `PROCESS_LOOPBACK_BUILD`, `excludesOwnAudio`), com os textos de "narração" passados por parâmetro.
- **`audio-capture`** (renderer): aquisição do áudio do PC pelo Chromium (`getDisplayMedia` com `restrictOwnAudio`) e medidor por WebAudio, com envio injetado em vez de `window.api`.
- **Receita de voz tratada** (`apps/ediaula/src/shared/voiceChain.ts` + `main/voiceTreat.ts`, RNNoise): só é extraída se o Captura oferecer voz tratada (decisão D2). Caso contrário, fica no EdiAula.

### 4. OCR: novo package `@informach/edi-ocr`

Package próprio, porque roda no renderer/worker com `tesseract.js` e wasm e não deve pesar no SDK main-only.

- **`.`**: schema de resultado (palavras, linhas, bounds, confiança, inclinação), com idiomas e limites parametrizados e um estado explícito de "indisponível", distinto de "sem texto". Inclui `ocrScore`, `ocrInclination` e `ocrPoint`.
- **`/worker`**: entrada do worker Tesseract (`ocr-worker.ts`), com base de assets e limites recebidos por parâmetro.
- **`/canvas`**: `recognizeImage`, `prepareOcrImage`, `recognizeOcrCanvas` (quatro orientações e deskew) e **tiling com sobreposição e deduplicação**. O tiling é novo e obrigatório para o Captura: rolagens chegam a 30000 px, e o limite atual é 8192 px / 24 MP.
- **`/search`**: `findTextMatches` de `apps/edipdf/src/shared/text-search.ts`, generalizado para `{text, box}`.
- **`/sensitive`**: novo. Detecção assistida de e-mail, telefone, CPF e CNPJ com dígito verificador, e de padrões de credenciais. Sempre revisável, sem ocultar nada sozinho.
- **Recursos e build**: os modelos `por`/`eng`/`spa`, `sources.json`, licenças e a verificação SHA de `apps/edipdf/scripts/copy-pdfjs.mjs` passam para o package. Um helper de build copia worker, core e modelos para o `public/ocr` de cada app. Uma capability `ocr` no catálogo `packages/config/src/edi-tools.ts` faz avisos de terceiros e inventário seguirem o mesmo caminho do `nativeMedia`.
- **Fica no PDF**: `ocrPageSchema`, `addOcrLayer`, `ocr-task.ts`, `task-format.ts`, `ocr-bookkeeping.ts`, `search-redaction.ts` e `OcrDialog.tsx`.
- **Fica no Captura**: mapeamento de bounds para recorte/escala/rotação do raster final, seleção e cópia sobre a cena, correções persistidas no projeto, máscaras e índice da biblioteca.
- **Ajustes no Captura**: CSP do editor com `wasm-unsafe-eval` e `worker-src`; o worker entra pelo Vite que já constrói o renderer.

### 5. Win32 (depois, sem bloquear o Captura)

Meta: um único helper nativo da suíte (C# compilado, como o do EdiAula), a partir de um package `packages/edi-native`, com cursor, janelas/telas, foco/roda, loopback e FileDrop. Cada instalador leva sua cópia. Isso tira o PowerShell da captura e do clipboard do Captura, que é o mesmo risco que levou o EdiAula ao helper próprio. É uma migração grande, com homologação Windows própria. Até lá, a única correção imediata é `windows-file-clipboard.mts` usar `windowsPowerShellEnvironment`.

## Ordem de retomada

Cada etapa tem review e gates próprios, conforme o padrão da frente. As extrações vêm imediatamente antes do lote que as consome.

| Etapa | Conteúdo | Consumidores verificados |
| --- | --- | --- |
| E1 | Executor FFmpeg único e `media-range` | EdiAula e EdiCaptura (`test:media-native`, `test:video-native`, nativo) |
| E2 — 5c | `audio` e `audio-capture`; microfone e áudio do PC opcionais, medidores, mudo, contagem regressiva, pausa manual e duração ativa no gravador atual do Captura | EdiAula (medidores) e EdiCaptura |
| E3 | `@informach/edi-ocr` extraído do EdiPDF, com o PDF migrado primeiro e sem mudar comportamento | EdiPDF (unitários, OCR real, jornada nativa) |
| E4 — 6 | OCR no Captura com tiling, seleção/cópia/correção, busca, detecção assistida e máscaras; A04 (renumeração e rótulos) | EdiCaptura e EdiPDF |
| E5 — 7 | Guias simples HTML/PDF. Se precisar de PDF, extrair `imageToPdf` e `embedUnicodeFont` de `apps/edipdf/src/shared/build.ts` para um subpath pequeno; não levar o `buildPdf` do editor | EdiCaptura e EdiPDF |
| E6 | `ai-clients` e `mcp-server` a partir do EdiAula; migrar EdiFoto e EdiSVG | EdiAula, EdiFoto e EdiSVG |
| E7 — 8 | IA do Captura pela assinatura do usuário e compartilhamento (depende de storage/backend ainda inexistente) | EdiCaptura |
| E8 | Helper nativo único | Todos que usam Win32 |

A E6 não depende do Captura e pode correr em paralelo com E2–E5, se houver outra sessão. É a extração que mais reduz duplicação hoje.

## Decisões do titular

Em 19/10/2026 o titular aprovou as quatro recomendações abaixo (D1 a D4) e autorizou implementar a proposta. A implementação corre na branch `feat/edi-base-comum`. O andamento por etapa fica registrado no fim deste documento.

- **D1 — Arquitetura do áudio na 5c.** Recomendado: manter o gravador atual do Captura (MediaRecorder WebM, journal com ACK já aprovado) e somar microfone e áudio do PC na mesma gravação. O áudio do PC vem pelo Chromium, com exclusão do próprio app. A alternativa é migrar o Captura para FFmpeg por fonte, como o EdiAula, o que reabriria o 5a já revisado. O helper WASAPI só entra se o caminho Chromium falhar em hardware real.
- **D2 — Voz tratada no Captura.** Recomendado: não, para manter o Captura enxuto. A receita fica no EdiAula.
- **D3 — Motor de OCR.** Recomendado: somente Tesseract, pelo package comum, nos dois apps. O resultado é o mesmo, offline, e já tem modelos fixados. Não usar Windows.Media.Ocr como segundo motor.
- **D4 — Ordem.** Recomendado: E1 → E2 → E3 → E4 → E5, com E6 em paralelo, e E7/E8 depois.

## O que não muda

Apps não importam apps. Não há passagem direta entre apps. Packages não ganham build próprio; TypeScript novo usado no main entra em `ediBuildOptions({ bundledPackages })`. As retiradas de escopo do [foco na suíte](foco-na-suite.md) continuam valendo.

## Andamento

| Etapa | Estado |
| --- | --- |
| E1 | Implementada: executor único e `media-range`; SDK 83 testes, EdiAula 944 testes (928 aprovados, 16 opt-in pulados, 0 falhas), Captura 166 unitários e renderer |
| E2 | Implementada: `@informach/edi-desktop/audio` e fase 5c do Captura (microfone e áudio do PC opcionais, volume, mudo, medidores, contagem e pausa manual); renderer Chromium cobre som e pausa. Homologação física de áudio pendente |
| E3 | Implementada e integrada em `feat/edi-base-comum`. `@informach/edi-ocr` criado (raiz, `/worker`, `/canvas` com blocos, `/search`, `/sensitive`, `/assets`); modelos, `sources.json` e licenças movidos do EdiPDF sem alterar bytes (SHA conferido); catálogo com `ocr` e `hasOcr`. EdiPDF migrado: 272 testes do app (3 neutros passaram para o package, que tem 29, incluindo OCR real offline dos três modelos), tipos e build aprovados; worker, núcleos e modelos do renderer construído idênticos aos de antes. A jornada nativa do EdiPDF não rodou nesta máquina (o `electron-vite` do worktree falha antes do build, também sem a mudança) e continua pendente para a revisão. Ver [README do package](../../../../packages/edi-ocr/README.md). |
| E4 | Implementada: fase 6 do Captura com `@informach/edi-ocr` (texto da imagem com blocos, correções, cópia só do texto visível, busca opcional na biblioteca, dados sensíveis viram máscaras opacas revisadas) e A04 (renumeração e número de passo). Captura 171 unitários, renderer com OCR real no Chromium; busca em 10.000 capturas em cerca de 20 ms |
| E5 | Pendente |
| E6 | Implementada em 19/10/2026 e integrada em `feat/edi-base-comum`: `ai-clients` e `mcp-server` no `edi-desktop`; EdiAula, EdiFoto e EdiSVG migrados e cópias apagadas. Ganhos no EdiFoto e no EdiSVG: prompt por stdin, token por execução, guarda do Codex e guarda por ferramenta (escrita externa pergunta em diálogo nativo). Typecheck, testes e build dos três apps e do package passaram localmente; sem homologação com Claude Code/Codex reais. Detalhes no README do package. |
| E7 | Pendente (depende de E6) |
| E8 | Pendente |
