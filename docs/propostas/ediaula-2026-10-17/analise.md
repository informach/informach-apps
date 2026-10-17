# EdiAula: o que falta para substituir o Camtasia

Data: 17/10/2026. Código analisado: `apps/ediaula` em `09c6b44` (branch `feat/bastidores`), idêntico ao de `origin/main` em `0415ff4`. Análise somente de leitura, pedida pela titular: listar o que precisa de ajuste, o que precisa de melhoria e o que ainda precisa ser implementado, com foco na gravação de aula e de tela. O objetivo do produto é substituir o Camtasia por completo e tornar a produção de aulas mais rápida e mais inteligente do que nele.

Nenhum código foi alterado. Este documento é diagnóstico e proposta de prioridade; nada aqui foi implementado ou aprovado para implementação.

## Como foi feito

- A gravação foi lida por inteiro: captura (`src/main/recorder.ts`), janela e atalhos do gravador (`src/main/recorderWindow.ts`), tela de controles (`src/renderer/src/recorder/RecorderOverlay.tsx`), capturador de cursor e teclas (`resources/cursor-hook.ps1`), modo guiado (`src/shared/guidedRecording.ts`, `src/shared/guidedRunner.ts`, `src/main/guidedBrowser.ts`, `resources/guided-input.ps1`), importação para o projeto (`src/renderer/src/lib/recording.ts`), cursor e zoom (`src/shared/cursor.ts`, `src/shared/zoom.ts`, `src/renderer/src/lib/cursorDraw.ts`) e narração por cima (`src/renderer/src/editor/NarrationPanel.tsx`).
- Três revisores independentes leram editor e timeline, exportação e áudio, IA e roteiro. Os achados P0 deles foram conferidos no código antes de entrar aqui.
- Dois achados de exportação foram medidos com `buildExportPlan` real e o FFmpeg 9.0.2 do pacote (`.cache/edi-native-media`), numa máquina de 12 threads: tamanho da linha de comando e custo por quadro dos efeitos. Os scripts de medição foram descartáveis e não estão versionados.
- Deriva de áudio, atraso da câmera, lentidão da timeline e da prévia foram deduzidos do código e aparecem como "provável". Precisam de teste antes de virar correção.

Caminhos sem prefixo são relativos a `apps/ediaula/`. Prioridades: **P0** quebra ou perde trabalho; **P1** atrapalha muito a produção; **P2** melhoria; **P3** desejável.

## Resultado

A base é boa e já faz coisas que o Camtasia não faz: cursor gravado à parte e editável, zoom automático nos cliques, teleprompter com o roteiro do projeto, gravação guiada pela narração do HeyGen, limpeza pela transcrição, encaixe das inserções do avatar e uma IA que opera o editor por ferramentas.

O que impede a substituição hoje é confiabilidade: a gravação pode falhar sem avisar, aulas de 20 a 30 minutos não exportam ou param de salvar, e a limpeza automática corta trechos que deviam ficar. Resolvido isso, o ganho seguinte é velocidade, porque vários passos que o app poderia fazer sozinho ainda são manuais.

### O que já está sólido

- Captura pela Desktop Duplication sem o ponteiro, com o cursor registrado no mesmo relógio do vídeo e coordenadas em pixels físicos por monitor.
- Segmentos em MP4 fragmentado, legíveis depois de uma interrupção; região com dimensões pares; controles do gravador fora da captura por proteção de conteúdo; parada por licença com preservação testada (`tests/recording-preservation.test.ts`).
- Salvamento do projeto atômico, com cópia periódica em `.backups`; desfazer com compartilhamento estrutural, sem copiar o projeto inteiro a cada passo.
- Prévia e exportação usam os mesmos cálculos de `src/shared` para cursor, zoom, transições e keyframes.
- A exportação grava em área temporária e não apaga mais o arquivo anterior em caso de falha (R02 de `../edi-suite-2026-10-16/full-review.md`, coberto por `tests/export-safety.test.ts`).
- Chave da API cifrada no processo principal; o servidor MCP local exige token, confere Host e recusa Origin; o Claude Code roda sem ferramentas próprias.

## 1. Gravação de aula e de tela

### 1.1 Ajustes

| # | Prioridade | Achado | Onde | O que acontece hoje |
| --- | --- | --- | --- | --- |
| G1 | P0 | Falha no meio da gravação não aparece | `src/main/recorder.ts:365`, `:426` | Se o FFmpeg cair (disco cheio, microfone ou câmera desconectados, erro do NVENC), o erro só fica guardado e o cronômetro continua contando. A professora descobre no fim do take. |
| G2 | P0 | Capturador do cursor pode morrer sem aviso | `src/main/recorder.ts:224`; `resources/cursor-hook.ps1` | Depois do READY ninguém observa o fim do processo. O hook de mouse roda no PowerShell e grava no stdout a cada evento; se o processo principal demora a ler, o Windows remove o hook. Como a tela é gravada sem ponteiro, o trecho fica sem cursor. |
| G3 | P0 | Queda do app perde cursor, marcadores e áudio do PC | `src/main/recorder.ts:200`, `:599`; `RecorderOverlay.tsx:156` | Eventos ficam só em memória até o fim; o áudio do PC fica no renderer. O vídeo sobrevive, mas sem cursor, e não existe tela para recuperar a gravação interrompida. |
| G4 | P0 (por cálculo) | Gravação de 27 min ou mais não exporta | `src/renderer/src/lib/cursorRender.ts:55`; `packages/edi-desktop/src/files.ts:297`; `packages/edi-desktop/src/main.ts:60` | As posições do cursor vão por IPC como array comum, dois números por quadro da gravação inteira, e o SDK recusa mais de 100 mil itens por chamada. Com o projeto na mesma chamada, o limite chega perto de 20 min. Correção: enviar `Int32Array`. |
| G5 | P1 | Cliques nos controles do gravador entram no vídeo | `RecorderOverlay.tsx:574-612`, `:846` | Pausar, marcar, parar e avançar o teleprompter com o mouse ficam no `cursor.json`: o cursor viaja até o canto, a onda de clique aparece onde não há nada e o zoom automático pode mirar ali. |
| G6 | P1 | Pausar fecha o FFmpeg e retomar abre outro | `src/main/recorder.ts:372-410`, `:378` | A retomada espera abrir tela, microfone e câmera de novo: as primeiras palavras depois do F9 se perdem, pode estalar e, se o dispositivo não reabrir, a sessão falha. Não há tempo limite se o FFmpeg não obedecer ao `q`. |
| G7 | P1 | Sem medidor de microfone durante a gravação; medidor pode mostrar outro microfone | `RecorderOverlay.tsx:503`, `:729-736`; câmera em `:781-789` | O medidor só existe na preparação. Ele casa o nome do dispositivo por trecho de texto e cai no microfone padrão quando não acha. |
| G8 | P1 | Áudio do PC dessincroniza nos cortes e nas pausas | `src/shared/cleanup.ts:266-279`; `src/main/recorder.ts:493-506`; `src/shared/inserts.ts:116-117` | Sem transcrição, a faixa não entra nos alvos de corte nem abre espaço nas inserções: o vídeo anda e o som da plataforma fica. O deslocamento é medido só no primeiro trecho, então cada pausa acumula um pequeno erro. |
| G9 | P1 (provável) | Sincronia da câmera e deriva do microfone sem medição | `src/renderer/src/lib/recording.ts:96-105`; `src/main/recorder.ts:286` | A câmera entra alinhada no zero sem medir o atraso de abertura, e o microfone por dshow vai sem correção de deriva. Medir com claquete num take de 20 min. |
| G10 | P1 | Intel e AMD gravam e exportam na CPU | `src/main/ffmpeg.ts:268-289`; `scripts/edi/media/build.sh:92-96`; `scripts/edi/test-media.mts:22` | O FFmpeg do pacote é compilado com `--disable-autodetect` e só tem NVENC e x264, sem AMF, QSV ou Media Foundation. Em 1440p ou 4K o x264 `ultrafast` perde quadros, e nada avisa. |
| G11 | P1 | Ajudantes nativos em PowerShell | `src/main/recorder.ts:30-44`; `src/main/guidedRecording.ts`; `resources/*.ps1` | Cursor, teclas e modo guiado dependem de `powershell -ExecutionPolicy Bypass` e `Add-Type`. Em PC de escola com AppLocker ou Constrained Language Mode isso não roda, e um hook de teclado em PowerShell tem perfil de keylogger para antivírus. Caminho: executável nativo assinado com a suíte. |
| G12 | P1 | Trabalhos de fundo disputam a máquina durante a gravação | `src/main/index.ts`; `src/renderer/src/state/exportQueue.ts`; `packages/edi-desktop/src/jobs.ts` | Fila de exportação, proxy, remoção de fundo e Whisper continuam rodando; nada consulta `isRecording`. Disputam CPU, GPU e sessões NVENC com a captura. |
| G13 | P2 | Teclas na tela mostram os atalhos do gravador | `resources/cursor-hook.ps1:82`; `src/renderer/src/lib/keysOnScreen.ts` | F1 a F12 contam como navegação e nada filtra Ctrl+M, F9 e F10. |
| G14 | P2 | Atalhos globais roubam teclas e conflitos passam calados | `src/main/recorderWindow.ts:35-41`, `:129-138` | Ctrl+R e Ctrl+M ficam reservados enquanto o gravador está aberto, e recarregar a página da plataforma deixa de funcionar. O retorno de `globalShortcut.register` não é conferido. |
| G15 | P2 | Cor sem marcação e conversão na CPU | `src/main/recorder.ts:304` | BGRA vira YUV 4:2:0 pelo swscale sem tag de cor, e o `hwdownload` antes do NVENC faz a conversão na CPU, caro em 4K. Ver também X6. |
| G16 | P2 | Câmera presa em 1280×720 a 30 fps | `src/main/recorder.ts:290-300` | Webcam sem esse modo falha ao abrir. |
| G17 | P2 | Escolhas do gravador não ficam salvas | `RecorderOverlay.tsx:79-84`, `:120` | A cada abertura voltam o primeiro microfone, câmera, áudio do PC e teclas desligados, região de tela inteira. |
| G18 | P2 | Cursor desenhado só como seta, mão ou barra de texto | `src/renderer/src/lib/cursorDraw.ts` | Espera, mover, redimensionar, proibido e os cursores próprios do Chrome (a mão de arrastar do Blockly vira `other`) aparecem como seta. |
| G19 | P2 | Suavização atrasa o cursor em relação ao clique | `src/shared/cursor.ts` (`buildTrack`) | A mola não passa pelo ponto do clique no instante do clique; a onda aparece antes de o cursor chegar. |
| G20 | P2 | Ctrl+R escolhe o corte por limiar fixo de volume | `src/shared/recording.ts` (`retakeCuts`) | Depende do ganho do microfone. Com a transcrição dá para achar o começo da frase. |
| G21 | P2 | Câmera fora da timeline e arquivo fragmentado | `src/renderer/src/lib/recording.ts:96`; `src/main/recorder.ts:462-465` | Com uma só faixa de vídeo destravada a câmera é importada mas não entra. Um take sem pausa fica em MP4 fragmentado, com seek mais lento. |
| G22 | P2 | Narração por cima com processamento do navegador e faixa nova a cada tomada | `NarrationPanel.tsx:112-113`; `src/shared/narration.ts:22-29` | Cancelamento de eco, supressão de ruído e ganho automático achatam a voz. Cada tomada cria uma faixa "Narração". |

**Modo guiado**

| # | Prioridade | Achado | Onde | O que acontece hoje |
| --- | --- | --- | --- | --- |
| G23 | P1 | Plano não é salvo e não retoma | `RecorderOverlay.tsx:84`, `:369-376` | Etapas e alvos marcados com F8 vivem no estado da tela do gravador. Fechar ou falhar perde tudo; depois de um erro só resta F10. |
| G24 | P1 | Faltam ações | `src/shared/guidedRecording.ts:29` | Não há arrastar (essencial no Blockly), rolar, duplo clique, atalho com modificador nem esperar elemento. |
| G25 | P1 | Alvo frágil | `src/main/guidedBrowser.ts:82`, `:104` | O seletor cai em `nth-of-type`, que muda quando o Blockly cria blocos; a URL precisa ser idêntica. |
| G26 | P2 | Movimento passa pelo PowerShell a cada 16 ms | `src/shared/guidedRunner.ts`; `resources/guided-input.ps1` | Em máquina lenta aparecem "O movimento atrasou" e a gravação pausa. |

### 1.2 Melhorias

- Taxa e qualidade: 30 fps fixo (`RecorderOverlay.tsx:216`). Oferecer 60 fps, qualidade e "gravar na resolução da aula".
- Região: só "Tela inteira" e "16:9 no centro". Faltam janela de um programa, 1920×1080 e 1280×720 exatos, travar proporção, digitar o tamanho e encaixar na janela.
- Zoom: o automático não roda ao importar e pede um botão por clipe (`src/renderer/src/editor/RecordingProps.tsx:200`). Os zooms da gravação não se editam na timeline, só se apagam ou mudam de escala juntos, e convivem com a camada de zoom, que é outro sistema. Unificar.
- Microfone em faixa própria, não dentro do arquivo da tela.
- Teleprompter com atalho global (ou passador de slides) para a próxima fala e avanço pela voz, em vez de 137 palavras por minuto fixas.
- Descartar o take e recomeçar sem fechar o gravador.
- Gravações em `Documentos/EdiAula/Gravações` com caminho absoluto, fora da pasta do projeto; não há reconectar mídia ausente (ver E15).
- Efeitos de cursor: lupa, holofote, som de clique, cor do halo e efeito por trecho.

### 1.3 A implementar

- **Painel de saúde da gravação:** nível e silêncio do microfone, espaço em disco, quadros perdidos, carga da máquina e aviso quando o capturador cai.
- **Recuperar gravação interrompida:** eventos do cursor gravados em disco durante a captura e, ao abrir o app, oferta de importar a pasta órfã.
- **Pausa sem parar a captura:** a pausa vira corte na importação. Retomada instantânea e nada se perde.
- **Gravar fala por fala do roteiro:** o teleprompter mostra a fala, cada fala vira um take, a transcrição ao vivo confere se foi dita inteira e as repetições ficam como alternativas para escolher.
- **"Preparar aula" ao parar:** transcrever, alinhar com o roteiro, propor limpeza e "fora do roteiro", zoom automático, encaixar inserções do HeyGen, legenda e modelo do curso, tudo como proposta para aprovar. Hoje a importação só gera proxy, forma de onda e remoção de fundo, e propõe os trechos de Ctrl+R.
- **Gravar a plataforma pelo navegador do app:** no modo guiado, clicar e arrastar dentro da própria página, sem mexer no mouse real, e capturar a página numa resolução fixa com o cursor desenhado a partir do plano. Fica imune a escala de tela, janelas por cima e atrasos do PowerShell, ganha o arrastar e permite regravar a aula quando a plataforma mudar.
- **Zoom pelo conteúdo:** seguir a digitação e as mudanças na tela, não só os cliques.
- **Captura de janela, cursor real** (imagem do cursor do sistema a cada troca de formato), fundo da webcam removido por IA, enquadramentos de câmera e desenho na tela durante a gravação.

## 2. Editor e timeline

### 2.1 Ajustes

| # | Prioridade | Achado | Onde | O que acontece hoje |
| --- | --- | --- | --- | --- |
| E1 | P0 | Estender quadro num clipe com Movimento impede salvar | `src/shared/timeline.ts:130`; `src/shared/project-schema.ts:5-8` | Keyframes anteriores ao ponto ficam com tempo negativo e o schema recusa todo salvamento até desfazer. O teste `tests/extend-frame.test.ts` não valida o schema. |
| E2 | P0 | Erro de salvamento seguido de sair descarta o trabalho | `src/renderer/src/state/project.ts:127-139`; `src/renderer/src/lib/actions.ts:168-173`; `src/renderer/src/editor/Editor.tsx:238-241` | `saveNow` engole o erro e voltar ao início, abrir outro projeto ou fechar a janela seguem em frente sem aviso. |
| E3 | P0 (provável) | Projeto longo pode parar de salvar pelo limite de IPC | `src/shared/timeline.ts:181-226`; `src/shared/cleanup.ts:213-226` | Cada pedaço de uma gravação dividida carrega todos os zooms dela. Depois de uma limpeza grande o projeto passa de 100 mil itens. Podar os zooms por pedaço ou movê-los para a mídia. |
| E4 | P1 | Dividir e cortar duplicam transição e entrada/saída e não deslocam keyframes | `src/shared/timeline.ts:195-226`, `:305-310` | O avatar com dissolve some e reaparece a cada corte da limpeza; o movimento salta depois de aparar. `extendFrame` já trata esses campos corretamente. |
| E5 | P1 | Ctrl+Z não desfaz a remoção de fundo | `src/renderer/src/state/project.ts:78-88`; `src/renderer/src/lib/keying.ts:30`, `:45-47` | `patch` reescreve o asset em todo o histórico. Também volta o tempo de edição medido. |
| E6 | P1 | Delete corta palavras com um clipe selecionado | `src/renderer/src/editor/Editor.tsx:173-184`; `TranscriptPanel.tsx:514-521` | Selecionar um clipe na timeline não limpa a seleção da transcrição: Delete faz um corte em todas as faixas em vez de apagar o clipe. |
| E7 | P1 | Fechar lacunas empilha tudo em 0:00 | `src/renderer/src/lib/actions.ts:67-75`; `src/shared/timeline.ts:262-271` | Balões, avatar, zoom e música perdem a sincronia com a fala. |
| E8 | P1 (provável) | Timeline lenta em aulas longas | `src/renderer/src/editor/Timeline.tsx:662-664`, `:331`, `:630` | Busca O(n²) de junções a cada render e `memo` anulado por handler recriado. Com cerca de 1.500 clipes são milhões de comparações por evento. |
| E9 | P1 (provável) | Prévia com um vídeo por pedaço e tolerância de 300 ms | `src/renderer/src/editor/Preview.tsx:66-78`, `:326-333`, `:537-611` | Depois da limpeza vários decodificadores leem o mesmo arquivo; imagem e voz do avatar ficam em elementos separados. Tranco e boca fora de tempo. |
| E10 | P2 | Tela cheia mostra a aula pequena | `Preview.tsx:155-167` | O tamanho é medido no contêiner errado. |
| E11 | P2 | Atalhos agem atrás de janelas abertas | `Editor.tsx:46-56` | Com a paleta ou a fila de exportação abertas, Delete, S e Ctrl+Z agem na timeline. |
| E12 | P2 | Lixeira da biblioteca apaga clipes sem confirmar; texto de anotação pode se perder | `Library.tsx:160-171`; `AnnotationProps.tsx:89-90` | O texto só é gravado no `onBlur`, que não dispara quando a seção é desmontada. |
| E13 | P2 | Autosave e histórico pesados | `src/renderer/src/state/project.ts:83-87`; `src/renderer/src/lib/editTimer.ts:18-23` | Validação do projeto inteiro no processo principal a cada salvamento, o mesmo que serve as mídias da prévia. |
| E14 | P2 | Timeline sem teclado nem leitor de tela | `Timeline.tsx:1235-1310` | Clipes e junções não recebem foco. |

### 2.2 Melhorias

- E15 Reconectar mídia ausente: hoje só aparece "Arquivo sumiu" e a exportação recusa (`Library.tsx:143-147`, `src/renderer/src/lib/importMedia.ts:113-125`).
- Excluir um intervalo em todas as faixas, aparar com ripple e inserir empurrando o que vem depois (`rippleDeleteRange` já existe em `src/shared/cleanup.ts:213`).
- Ímã em palavras, silêncios, marcadores e quadros, além das bordas dos clipes.
- Seleção por retângulo, "tudo à direita" e "tudo da faixa"; propriedades em lote.
- Precisão de quadro em seek, divisão, aparo e movimento; JKL com som e reprodução lenta.
- Miniaturas por posição no pedaço, fade e curva de volume, redução de ruído com prévia.
- Reordenar faixas, solo, propriedades com valor numérico, rotação e espelhar.
- Estender quadro abrindo espaço em todas as faixas.
- Templates salvos pelo curso, duplicar e renomear projeto, restaurar backup, formato vertical e troca de formato.
- Portabilidade: anotações, quadros estendidos e camadas de zoom ficam no cache do app com caminho absoluto; levar o projeto para outro PC quebra esses itens.
- Testes que validem schema e limite de IPC depois de cada operação de timeline.

### 2.3 A implementar

Grupos; biblioteca entre projetos e favoritos; editor de legenda e transcrição; desfoque e holofote de região (nomes de alunos na plataforma); substituir mídia mantendo as edições (HeyGen gerado de novo); marcadores e capítulos na timeline; faixa magnética; separar áudio do vídeo; envelope de volume e "destacar" uma faixa abaixando as outras; efeitos visuais (cor, moldura de dispositivo, fundo dinâmico, máscara); animações por palavra e seta que se desenha; verificação antes de exportar; revisão rápida dos cortes (tocar 1,5 s em volta de cada um, aprovar ou desfazer); navegação por palavra e por silêncio; quizzes exportáveis para a plataforma.

## 3. Exportação, áudio e legenda

### 3.1 Ajustes

| # | Prioridade | Achado | Onde | O que acontece hoje |
| --- | --- | --- | --- | --- |
| X1 | P0 (medido) | Linha de comando do FFmpeg passa do limite do Windows | `src/shared/exportPlan.ts:190-213`, `:248-249`; `src/main/export-lesson.ts:77-88` | Uma entrada por pedaço, sprite de cursor e anotação vai na linha de comando; só o filtergraph vai para arquivo. Abaixo do limite, todas as entradas decodificam em paralelo desde o quadro 0. |
| X2 | P0 (medido) | Efeitos fixos recalculados pixel a pixel em todo quadro | `src/shared/exportPlan.ts:262-279`, `:283-302`, `:313-333`, `:363-371` | Máscara, borda e sombra via `geq` sem `enable`; zoom com `perspective` no clipe inteiro. Gerar máscara e sombra uma vez e aplicar o zoom só onde existe. |
| X3 | P0 | Limpeza de silêncio corta a fala de outra fonte | `src/shared/cleanup.ts:183-193`; `src/renderer/src/lib/transcripts.ts:115-119` | Os silêncios de cada fonte viram corte em todas as faixas. O avatar encaixado numa pausa da narração (o fluxo do Encaixar) é cortado inteiro. |
| X4 | P1 | "Só áudio (podcast)" sempre falha | `src/renderer/src/editor/ExportDialog.tsx:75`; `src/shared/project-schema.ts:308` | O preset manda bitrate 0 e o schema exige positivo. `tests/formats.test.ts` não passa pelo schema. |
| X5 | P1 | Projeto vertical sai em resolução reduzida | `ExportDialog.tsx:95`, `:241-248`; `src/shared/exportPlan.ts:127-130` | 1080×1920 sai em 608×1080 por padrão e no máximo 810×1440. |
| X6 | P1 (medido) | Cores deslocadas | `src/shared/exportPlan.ts:80-88`, `:499-520` | Composição em BT.601 e saída sem tag. O lima #C8F031 (200,240,49), lido como BT.709 pelo navegador e pelo YouTube, vira (198,224,40). |
| X7 | P1 (provável) | Estalos nos cortes e áudio sem fade | `src/shared/exportPlan.ts:387-395`; `src/shared/cleanup.ts:250-259` | Emendas secas a cada corte; dissolve do avatar sem fade de som; música termina seca. |
| X8 | P1 | NVENC sem plano B | `src/main/ffmpeg.ts:268-289`; `ExportDialog.tsx:139`, `:150` | Se o NVENC falhar na hora (sessões ocupadas por proxies ou gravação, driver), a exportação falha em vez de cair para x264. |
| X9 | P1 | Legenda duplicada ou com fala de faixa muda | `src/shared/cleanup.ts:81-105`; `src/renderer/src/state/exportQueue.ts:47-56` | MP4 mudo do HeyGen e WAV extraído dele, ambos transcritos, duplicam .srt, .vtt e legenda gravada. |
| X10 | P1 (provável) | Vídeo já transparente perde o alfa | `src/shared/exportPlan.ts:210-212`; `src/main/ffmpeg.ts:114-166` | O decodificador VP9 nativo descarta o alfa e o proxy é H.264: WebM transparente sai com fundo preto. |
| X11 | P1 | Whisper e modelo baixados sem conferência de integridade | `src/main/whisper.ts:14-21`, `:112-170` | Executável de 685 MB e modelo de 574 MB sem SHA-256, executados em seguida; sem retomada e com `.part` deixado no disco. |
| X12 | P2 | Loudnorm de uma passada; redução de ruído por pedaço e sem prévia | `src/shared/exportPlan.ts:52`, `:391`, `:426` | Alvo menos exato e ruído de fundo variando nas emendas. |
| X13 | P2 | Whisper sem detecção de voz | `src/main/whisper.ts:262-279`; `src/shared/whisperParse.ts:64-68` | Alucinação em silêncio vira legenda; o glossário entra com 40 termos e só condiciona o começo. |
| X14 | P2 | Trabalhos pesados sem agendador; cache sem limite | `src/renderer/src/lib/importMedia.ts:64`; `src/main/keying.ts:115`; `src/main/ffmpeg.ts:92-101` | Proxies em paralelo, até 6 workers de remoção de fundo por avatar e exportação disputando tudo. Pasta de saída parcial fica ao lado do destino se o app cair. |
| X15 | P2 | Texto corrompido no botão principal | `ExportDialog.tsx:366` | O arquivo tem literalmente "Adicionar ? fila" e "Adicionando?". |
| X16 | P3 | Detalhes | `ExportQueuePanel.tsx:83`; `src/main/export-lesson.ts:10-12`; `src/shared/cleanup.ts:336-344` | Progresso parado em 0% na preparação e 100% antes do fim; VTT gerado por regex sem escapar `<` e `&` (já existe `webVtt()`); cues de SRT sobrepostos e linhas acima de 42 caracteres. |

Medições de X1, com um projeto de 25 min (tela e câmera cortadas, 20 inserções de avatar e 60 anotações):

| Cortes | Entradas | Caracteres da linha de comando |
| --- | --- | --- |
| 60 | 280 | 30.906 |
| 80 | 340 | 38.587 |
| 120 | 460 | 51.792 |

O limite do Windows é 32.767 caracteres. A limpeza de uma aula de 20 a 30 min costuma gerar de 80 a 200 cortes.

Medições de X2 no FFmpeg 9.0.2:

| Efeito | Custo por quadro | Acréscimo numa aula de 25 min |
| --- | --- | --- |
| Cantos arredondados em 1080p | 1,2 s | cerca de 15 h |
| Câmera em círculo de 320 px | 107 ms | cerca de 80 min |
| Sombra em 1080p | cerca de 45 ms | cerca de 33 min |
| Perspective (zoom) | cerca de 25 ms | cerca de 19 min |

### 3.2 Melhorias

Editor de legenda e transcrição (corrigir "Debinha" e "Zappy", quebra, tempo e estilo por cue); qualidade por CRF ou CQ conforme a resolução, com AQ e lookahead no NVENC; rascunho rápido com proxies e decodificação por GPU; 60 fps; HEVC e AV1 pelo NVENC, AMF e QSV no build; cadeia de voz (nivelamento entre avatar e microfone, compressor, de-esser, `speechnorm`); redução de ruído por IA (`arnndn` já está no binário, falta o modelo); parâmetros da limpeza visíveis; vários formatos num clique e lote por curso; fila que sobrevive ao fechar o app; ducking configurável; escolha da miniatura; avatar recortado acima de 1920 px para exportação 4K.

### 3.3 A implementar

Reconectar mídia ausente; render por segmentos com cache e paralelismo (resolve X1); exportar um intervalo e o quadro atual em PNG; projeto empacotado em zip com as mídias; capítulos e título no MP4 (`publish.chapters` já existe); limpeza contextual com a IA (falsos começos, respiração, "então" e "aí" de muleta); stems de voz e música; legendas traduzidas e dublagem; ferramenta de exportação para a IA; publicação direta.

## 4. IA, roteiro e automação

### 4.1 Ajustes

| # | Prioridade | Achado | Onde | O que acontece hoje |
| --- | --- | --- | --- | --- |
| I1 | P0 | Proposta de um projeto aplicada em outro | `src/renderer/src/lib/proposals.ts:81-83`, `:99`; `src/renderer/src/state/project.ts:49-58` | A proposta não guarda o projeto, abrir outro não a limpa e `load()` não muda a revisão. Os mesmos segundos são cortados na aula errada. |
| I2 | P0 | Codex por `codex.cmd` executa a mensagem no cmd.exe | `src/main/engines.ts:300-307` | Com `shell: true` os argumentos não são escapados: quebras de linha mutilam o pedido e `&`, `|`, `>` e `%VAR%` executam comandos. Ocorre quando o executável do Codex não é achado e sobra o `.cmd`. |
| I3 | P0 (provável) | Claude Code por `claude.cmd` trava o desfazer | `src/main/aiSettings.ts:78-88`; `src/main/engines.ts:146-150`; `src/renderer/src/state/assistant.ts:88-97` | O Node recusa `.cmd` sem shell. O turno falha sem `done`, o agrupamento do desfazer fica aberto e o resto da sessão vira um único Ctrl+Z. |
| I4 | P0 | Limpeza corta demonstração silenciosa e "Limpar a aula" corta direto | `src/shared/cleanup.ts:183-193`; `src/renderer/src/lib/aiTools.ts:303-326`; `AssistantPanel.tsx:27-32` | O silêncio é medido só no áudio, sem olhar cliques e arrastos do `cursor.json` nem as pausas do modo guiado. O botão rápido aplica sem proposta, contra a regra do próprio guia. |
| I5 | P1 | Limpeza ignora quem fala | `src/shared/cleanup.ts:108-123`, `:147-181` | Palavras de todas as fontes se misturam: a professora repetindo a fala da Debinha conta como repetição e a fala do avatar é cortada. |
| I6 | P1 | Repetição sem limite de distância | `src/shared/cleanup.ts:153-176` | "Clique aqui. [5 s de demonstração] Clique aqui." corta a demonstração inteira. |
| I7 | P1 | IA ignora as escolhas do painel de limpeza | `src/renderer/src/lib/aiTools.ts:280-326`; `src/renderer/src/lib/transcripts.ts:121-124` | O que foi marcado para manter é cortado quando se pede "aplique". |
| I8 | P1 | Desfazer e concorrência | `aiTools.ts:392-400`; `src/renderer/src/state/project.ts:66-105`; `src/renderer/src/state/assistant.ts:88-97` | `undo` da IA desfaz o turno inteiro; edição manual durante o turno entra no mesmo Ctrl+Z; trocar de aula no meio do turno faz a IA editar a outra. |
| I9 | P1 | Foto velha do projeto sobrescreve edições | `src/renderer/src/lib/script.ts:93`, `:146`, `:215-220`; `aiTools.ts:371-390` | `place_insert` e `protect_text` gravam a partir do estado lido antes de um `await`; chamadas MCP rodam em paralelo sem trava. |
| I10 | P1 | "Fora do roteiro" corta no meio da frase | `src/shared/scriptAlign.ts:35-59`, `:114-158` | Paráfrase, números por extenso acima de 10, termos com hífen e nomes ("Zapi" por "Zappy") viram corte. A escolha automática de seção pode errar e propor cortar quase a aula toda. |
| I11 | P1 | Proposta frágil | `src/renderer/src/lib/proposals.ts:23-34`, `:99-108` | Itens só com tempo somem depois de qualquer edição; reancoragem em segundos de timeline pode escolher a tomada errada. Ancorar no tempo da mídia ou nas chaves de palavra. |
| I12 | P1 | `transcribe` só transcreve o primeiro candidato | `aiTools.ts:429-448`; `src/renderer/src/lib/transcripts.ts:255-273` | Com o MP4 do avatar já transcrito, a narração nunca é transcrita. |
| I13 | P1 | Configuração manual do MCP dá 403 | `src/renderer/src/settings/SettingsModal.tsx:81-85`, `:268-271`; `src/main/mcpServer.ts:60-63` | Os trechos mostrados não levam o cabeçalho de autorização; `npx -y mcp-remote` sem versão fixa. |
| I14 | P1 | Codex não fica restrito às ferramentas do editor | `src/main/engines.ts:287-293`; `SettingsModal.tsx:107-109` | Em `read-only` ele ainda roda leitura de shell e pode ler qualquer arquivo do usuário, inclusive por injeção vinda de um roteiro ou modelo de edição. A tela afirma o contrário. |
| I15 | P2 | Prompt por linha de comando | `src/main/engines.ts:126-145`, `:300-301` | Limite de cerca de 32 mil caracteres (um roteiro como `tests/fixtures/roteiro-farol-dia1.md` com o guia não cabe) e texto começando com "-" lido como opção. |
| I16 | P2 | Modelo, parâmetros e consumo | `src/main/aiSettings.ts:11`; `src/main/assistant.ts:22`, `:86-111`; `aiTools.ts:232-278` | Padrão `claude-opus-5` quando o `claude-opus-5-5` é mais novo e mais barato; `effort` não enviado; transcrição inteira a cada chamada e histórico sem compactação. |
| I17 | P2 | Token MCP permanente e caminhos livres | `packages/edi-desktop/src/main.ts:392-397`; `src/main/restricted.ts:21-30`; `aiTools.ts:450-455`, `:703-709` | Token em argv e em arquivo; `import_media`, `add_image`, `set_audio` e `open_project` aceitam caminho de rede (provável vazamento do hash NTLM por injeção). A proposta da suíte pede token de curta duração e permissão por operação. |
| I18 | P2 | Inserções movem faixa travada | `src/shared/inserts.ts:117`; `src/shared/scriptAlign.ts:105-112` | `openGap` desloca clipes de faixas travadas; falas curtas do avatar casam com a ocorrência errada. |
| I19 | P2 | Núcleo da IA sem testes | `tests/` | Faltam testes de handlers, propostas, agrupamento do desfazer, argumentos dos motores e limpeza com várias fontes. |

### 4.2 Melhorias

Proposta revisável item a item, com "ouvir pulando o corte" e salva no projeto; correção da transcrição pelo glossário, também usado no alinhamento; limpeza consciente da tela e do locutor, sempre como proposta; ferramentas por chave de palavra, com revisão devolvida e respostas resumidas; rascunho para qualquer edição da IA (anotação, zoom, inserção, paleta); alinhamento para português falado (contrações, números, nomes); inserções do HeyGen em lote e IDs reconhecidos dentro do "Na tela"; narração guiada pelo roteiro com alinhamento automático da tomada; painel com progresso, custo e "o que mudou"; modelo de edição com regras em vez de lista de clipes (`T-ACF.md` tem 1.510 linhas e 34 clipes, com papéis genéricos e música sem abaixamento) e uma ferramenta que gere a proposta a partir dele.

### 4.3 A implementar

- Do roteiro ao vídeo num clique, encadeando transcrição, seção, cortes, inserções, modelo da aula anterior, zoom, anotações do "Na tela", legenda, cartelas e verificação, com pontos de aprovação.
- IA que vê o quadro do vídeo (`get_frame` com tempo e região) para posicionar seta, balão e zoom e conferir "não cobrir controles".
- Verificação antes de exportar: silêncio no início e no fim, volume, duração fora do alvo, falas não gravadas, ponte do Zappy falada, vozes sobrepostas, legenda fora da área segura, letra pequena para 9 a 14 anos, velocidade de leitura.
- Regravação assistida das falas ausentes ou parciais, com teleprompter só delas e encaixe automático.
- Falas do avatar geradas pela API do HeyGen a partir do ID da inserção.
- IA paga da suíte pelo backend com `@informach/ai-core`, `withCredits` e `runId`, autenticada pela licença Edi, mantendo chave própria e assinaturas como opções.
- Aprender com a aula anterior: aplicar o modelo do curso ao abrir a aula seguinte e ajustar limites conforme as propostas aceitas.
- Saídas para a plataforma: `videoId`, capítulos validados, resumo, quiz gerado do roteiro e miniatura.
- Lote por curso: dividir uma gravação longa nas seções e produzir todas de uma vez.

## Ordem recomendada

1. **Parar de perder trabalho:** G1 a G4, E1 a E3, X1 a X3 e I1 a I4.
2. **Gravação confiável em qualquer computador:** G5 a G12, com executável nativo no lugar do PowerShell e AMF, QSV ou Media Foundation no build de mídia.
3. **Limpeza que respeita a aula:** X3, I4 a I7 e G8, com microfades (X7).
4. **Velocidade:** "Preparar aula" ao parar, gravação fala por fala, zoom editável e unificado, editor de legenda, corte de intervalo em todas as faixas e reconectar mídia.
5. **Inteligência:** gravação da plataforma pelo navegador do app, IA que vê o quadro, verificação antes de exportar e HeyGen pela API.

Cada etapa precisa de testes que hoje não existem: carga com centenas de clipes, sincronia com claquete, cor, duas fontes transcritas, schema e limite de IPC depois de cada operação de timeline, e os handlers da IA.

## Pendências e decisões

- Nenhum item foi aprovado para implementação. A titular decide a ordem e o escopo.
- Os achados "provável" (G9, E3, E8, E9, X7, X10, I3) precisam de reprodução antes da correção.
- A troca dos ajudantes PowerShell por executável nativo e a ampliação do build de mídia afetam a distribuição assinada da suíte e seguem `docs/arquitetura-desktop.md` e o registro Windows.
