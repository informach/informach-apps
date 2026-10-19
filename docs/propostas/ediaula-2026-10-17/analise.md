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

## Estado em 18/10/2026

Em 17/10/2026 a titular pediu a implementação deste documento. O trabalho foi feito na branch `feat/ediaula-camtasia` (worktree `informach-ediaula-camtasia`), criada a partir de `origin/main` em `0415ff4`, em lotes: cada lote teve implementação, verificação, review independente do diff, um commit com as correções do review e um merge na branch. Em 18/10/2026 a branch está em `6e55f459`, com as correções das três revisões gerais do lote 15 (IA, editor e exportação, gravação), sem push e sem PR; a verificação completa da branch está rodando agora, e o merge na `main` depende da aprovação da titular. O plano aprovado foi seguido na ordem dele, com três acréscimos pedidos pela titular no caminho: o lote visual, o modo "Voz e câmera" e o áudio do PC sem o som do app.

Cada "Feito" abaixo foi conferido no código desta branch, pelo arquivo ou pelo teste citado. Caminhos sem prefixo continuam relativos a `apps/ediaula/`.

**Estados:** **Feito** é implementado e conferido no código. **Parcial** é implementado em parte, ou implementado sem a prova que o próprio item pede (uma medição ou uma máquina que não tivemos). **Pendente** não entrou. **Fora por decisão** foi tirado do escopo pela titular em 17/10/2026.

**Resumo:** dos 76 itens numerados (G1 a G26, E1 a E15, X1 a X16 e I1 a I19), 71 estão feitos, 4 parciais (G9, G10, G11 e E13) e 1 pendente (E14). Dos 88 itens sem número das listas de melhorias e do que faltava implementar, 76 estão feitos, 6 parciais, 2 pendentes e 4 fora por decisão. No total, 147 feitos, 10 parciais, 3 pendentes e 4 fora por decisão.

### Lotes e commits

| Lote | Merge | Commits do lote |
| --- | --- | --- |
| Análise (este documento) | `c76ab517` | `c76ab517` |
| 1. Salvamento e timeline sem perda de trabalho | `69697bfd` | `9a6eff56`, `df75a129` |
| 3. Auxiliar nativo e FFmpeg com AMF e Media Foundation | `41daf2f2` | `99ce793b`, `2444a04a`, `652b6617` |
| 2. IA segura e consistente | `ada62f33` | `9af69e1e` (edi-desktop), `87a6f898`, `dbe320d8` |
| 4. Sessão de gravação confiável | `34d0daf3` | `193b0290`, `c499cfb0` |
| 8. Whisper conferido, glossário e editor de palavras | `f4174c4d` | `21400ed8`, `6294aaf0`; licença do léxico em `1fa64422` |
| Teste nativo com o projeto em texto JSON | sem merge | `eef03194` |
| 5. Voz, vídeo do apresentador e tela | `28c23f8b` | `717f4bbc`, `731828d9` |
| Teste visual de ponta a ponta | `2af8e1d9` | `29946826` |
| 6. Limpeza que respeita a aula | `877825ff` | `693cbde3`, `a767344c` |
| 7. Exportação por trechos, cor e som | `6e96c511` | `f56f87c6` (edi-desktop), `13c8b2b6`, `9cf949fb`, `4be19380`, `8a1821be` |
| 11. Preparar aula, revisão e verificação | `5318f8a0` | `762b56c7`, `a44206dc` |
| 9. Modo guiado pela página da aula | `e833499c` | `5895ab10`, `416e6145` |
| 12. Melhorias do editor | `e80e3edc` | `797897b0`, `fd57c475` |
| 14. IA que vê, regrava, traduz e entrega | `f1aeac05` | `7ebe26e8`, `a0112a75` |
| Visual: correções do teste visual, apresentador e Voz e câmera | `12d2833a` | `1026dc3f`, `0f5020f3` |
| 13. Grupos, marcadores, efeitos e exportações extras | `952f8a51` | `ee3f1036`, `a670eee7` |
| 10. Gravação, cursor, zoom e acabamento | `82d8b687` | `1e801849`, `2acc8815` |
| `origin/main` trazida para a branch | `70f06077` | |
| 15. Revisão geral da IA | `ebfdde1b` | `376f9278` |
| 15. Revisão geral do editor e da exportação | `4b3c3d21` | `030374ad` |
| 15. Revisão geral da gravação | `6e55f459` | `4d3fd4b9` |

### Gravação de aula e de tela (G1 a G26)

| # | Item | Estado | Lote | Observação |
| --- | --- | --- | --- | --- |
| G1 | Falha no meio da gravação aparece | Feito | 4 | Um FFmpeg por fonte; tela ou microfone que param pausam a gravação com "Retomar" e "Parar e salvar" (`src/main/recording/session.ts`, `RecorderOverlay.tsx`); `tests/recording-preservation.test.ts`. |
| G2 | Capturador do cursor vigiado | Feito | 3 | `ediaula-helper.exe` com batimento e gancho reinstalado; `src/main/nativeHelper.ts` reinicia o auxiliar até três vezes por minuto e a pílula mostra "sem cursor"; `tests/nativeHelper.test.ts`. |
| G3 | Queda do app não perde a gravação | Feito | 4 | Diário `sessao.jsonl`, `cursor.jsonl` do auxiliar, áudio do PC em partes no disco e o modal "Gravação interrompida" (`src/main/recording/recovery.ts`, `src/renderer/src/home/OrphanRecordings.tsx`); `tests/recordingJournal.test.ts`. |
| G4 | Gravação longa exporta | Feito | 1 | Posições do cursor como `Int32Array` (`src/renderer/src/lib/cursorRender.ts`). |
| G5 | Cliques nos controles fora do vídeo | Feito | 4 | Retângulos do gravador enviados ao auxiliar (`recorder:uiRects`); trechos sobre os controles marcados no `cursor.json` v2. |
| G6 | Pausa sem fechar o FFmpeg | Feito | 4 e 15 | A pausa só anota no diário e vira corte na importação; pausa acima de 5 min fecha tela e câmera para poupar disco. Os segundos pausados ficam anotados em cada mídia (`src/shared/pausedMedia.ts`) e não voltam ao editor nem ao pacote; nos arquivos originais eles continuam (ver Pendências). |
| G7 | Medidor do microfone certo, também durante a gravação | Feito | 4 | Nível vem do mesmo processo que grava; na preparação o medidor abre o mesmo dispositivo dshow. |
| G8 | Áudio do PC sincronizado | Feito | 2 e 4 | Alinhamento por trecho na finalização; `cutTargets` leva microfone e áudio do PC (`src/shared/cleanup.ts`, `asset.recording.role`). |
| G9 | Sincronia da câmera e deriva do microfone | Parcial | 4 | `aresample` assíncrono no microfone, atraso da câmera ajustável e teste sintético de flash e bipe. Falta o take real de 20 min com claquete. |
| G10 | Intel e AMD pela GPU | Parcial | 3 | AMF e Media Foundation no build (`scripts/edi/media`), detector em `src/main/encoders.ts` e `src/shared/encoderChoice.ts`. Sem teste em máquina Intel ou AMD. |
| G11 | Ajudantes sem PowerShell | Parcial | 3 | `native/helper/*.cs` compilado pelo `csc.exe`; os `.ps1` saíram. Falta testar com AppLocker e Defender, e o executável não tem Authenticode. |
| G12 | Trabalhos de fundo esperam a gravação | Feito | 4 | `src/main/scheduler.ts`; `tests/scheduler.test.ts`. |
| G13 | Teclas na tela sem os atalhos do gravador | Feito | 3 | O auxiliar recebe as teclas que nunca aparecem (`src/shared/helperProtocol.ts`). |
| G14 | Atalhos só durante a gravação e conflitos avisados | Feito | 4 | `src/shared/hotkeys.ts` (`hotkeyConflicts`), com Ctrl+Shift+M e Ctrl+Shift+R; `tests/hotkeys.test.ts`. |
| G15 | Cor marcada e conversão pela GPU | Feito | 3 e 4 | `src/shared/captureArgs.ts` com BT.709 e tags; caminho da GPU com `scale_d3d11` quando o detector aprova. |
| G16 | Câmera no modo que ela oferece | Feito | 4 | `src/shared/camera.ts` (`chooseCameraMode`); `tests/camera.test.ts`. |
| G17 | Escolhas do gravador salvas | Feito | 4 | `userData/recorder.json` (`src/main/recorderSettings.ts`); `tests/recorderSettings.test.ts`. |
| G18 | Todas as formas do cursor | Feito | 10 | Vetores para as formas do Windows e imagem real nos cursores próprios (`cursorDraw.ts`, `cursorImages.ts`). |
| G19 | Suavização presa ao clique | Feito | 10 | Mola para a frente e para trás em `buildTrack`; erro abaixo de 0,5 px no clique (`tests/cursor-effects.test.ts`). |
| G20 | Ctrl+R pelas palavras | Feito | 10 | `retakeCutsFromWords` em `src/shared/recording.ts`; `tests/retake-words.test.ts`. |
| G21 | Câmera na timeline e arquivo comum | Feito | 4 | Câmera ganha faixa própria (`src/shared/recordingImport.ts`); as partes viram `tela.mp4` comum na finalização. |
| G22 | Narração por cima sem processamento e na mesma faixa | Feito | 10 | `NarrationPanel.tsx` com eco, ruído e ganho desligados; `src/shared/narration.ts` reaproveita a faixa "Narração". |
| G23 | Plano guiado salvo e retomável | Feito | 9 | Plano v2 no projeto e rascunho contra queda (`src/shared/guidedPlan.ts`); `tests/guided-plan-v2.test.ts`, `tests/guided-store.test.ts`. |
| G24 | Ações que faltavam no guiado | Feito | 9 | Arrastar, rolar, duplo clique, passar o mouse, esperar e atalhos com modificador. |
| G25 | Alvo estável | Feito | 9 | `src/shared/locators.ts` (testid, papel, rótulo, Blockly) e URL por URLPattern; `tests/locators.test.ts`. |
| G26 | Movimento sem PowerShell | Feito | 3 e 9 | `glide` no auxiliar para outros programas; na janela da aula, CDP sem mexer no mouse real (`src/main/guidedCdp.ts`). |

### Editor e timeline (E1 a E15)

| # | Item | Estado | Lote | Observação |
| --- | --- | --- | --- | --- |
| E1 | Estender quadro com Movimento salva | Feito | 1 | Schema aceita keyframe antes do início do pedaço; `tests/extend-frame.test.ts` valida o schema. |
| E2 | Erro de salvamento não descarta o trabalho | Feito | 1 | `src/renderer/src/lib/leaveGuard.ts` e `SaveFailedDialog.tsx`; mensagem em português por tipo de erro desde o lote visual. |
| E3 | Projeto longo continua salvando | Feito | 1 | Zooms passaram para a mídia; `tests/timeline-invariants.test.ts` com 25 min e 200 cortes. |
| E4 | Dividir e cortar sem duplicar transição | Feito | 1 | `src/shared/pieces.ts`; `tests/pieces.test.ts`. |
| E5 | Ctrl+Z desfaz a remoção de fundo | Feito | 1 | `patch` só toca campos de runtime (`src/renderer/src/state/project.ts`). |
| E6 | Delete com clipe selecionado apaga o clipe | Feito | 1 | Selecionar um clipe zera o corte por texto (`Timeline.tsx`, `state/project.ts`). |
| E7 | Fechar lacunas sem empilhar tudo | Feito | 1 | `closeCommonGaps` em `src/shared/cleanup.ts`, com as faixas travadas intactas. |
| E8 | Timeline rápida em aula longa | Feito | 1 | `adjacency` em O(n log n) e handlers estáveis; o teste conta as leituras. |
| E9 | Prévia sem tranco e com a boca no tempo | Feito | 1 e 13 | Deriva corrigida por `playbackRate` e um par de elementos por mídia, com a voz como relógio do avatar (`previewPool.ts`, `mediaPool.ts`); `tests/preview-pool.test.ts`. |
| E10 | Tela cheia no tamanho certo | Feito | 1 | Tamanho medido na área da prévia. |
| E11 | Atalhos esperam diálogos abertos | Feito | 1 | `dialogOpen()` em `Editor.tsx`. |
| E12 | Lixeira confirma e texto de anotação não se perde | Feito | 1 | `confirm` em `Library.tsx`; texto salvo ao desmontar em `AnnotationProps.tsx`. |
| E13 | Autosave e histórico mais leves | Parcial | 1 e 15 | O projeto vai como texto JSON, é validado uma vez por salvamento e, desde `030374ad`, é gravado compacto, com aviso perto de 80% do teto de 32 MB e teto de pontos de desenho por aula (`src/shared/projectSize.ts`); os dados que o app descobre sobre a mídia saíram do desfazer. O main ainda valida o projeto inteiro a cada salvamento (`saveProject` em `src/main/projects.ts`). |
| E14 | Timeline por teclado e leitor de tela | Pendente | | Só as alças de altura e o rótulo da faixa recebem foco; clipes e junções não. Não estava no plano. |
| E15 | Reconectar mídia ausente | Feito | 1 | `src/shared/relink.ts` e `media:relinkFolder`, levando o `cursor.json` junto; `tests/relink.test.ts`. |

### Exportação, áudio e legenda (X1 a X16)

| # | Item | Estado | Lote | Observação |
| --- | --- | --- | --- | --- |
| X1 | Linha de comando dentro do limite | Feito | 7 | Exportação por trechos (`src/shared/export/segments.ts`); com 25 min e 200 cortes cada comando fica abaixo de 8 mil caracteres (`tests/export-segments.test.ts`). |
| X2 | Efeitos fixos calculados uma vez | Feito | 7 | Máscara, anel e sombra em PNG (`src/main/export/fxAssets.ts`); `perspective` só onde há zoom; `tests/export-fx.test.ts`. |
| X3 | Silêncio só onde nenhuma fonte fala | Feito | 6 | `audibleSilences` e `speechIntervals` em `src/shared/cleanup.ts`; `tests/cleanup-sources.test.ts`. |
| X4 | Podcast exporta | Feito | 7 | Bitrate 0 aceito para áudio puro no schema. |
| X5 | Vertical em 1080 × 1920 | Feito | 7 | Resolução pelo lado menor (`ExportDialog.tsx`); `tests/export-orientation.test.ts`. |
| X6 | Cores certas | Feito | 7 | `src/shared/export/color.ts`; lima #C8F031 conferido em `tests/export-color.test.ts`. |
| X7 | Emendas sem estalo e fades no som | Feito | 7 | Microfades de 8 ms e fades de clipe, transição e música (`src/shared/export/audioPlan.ts`). |
| X8 | Plano B do codificador | Feito | 7 | Trecho refeito pela cadeia até o x264 (`isEncoderFailure`, `src/main/export/renderSegments.ts`). |
| X9 | Legenda sem duplicar nem ouvir faixa muda | Feito | 7 | `captionWords` em `src/shared/captions.ts`. |
| X10 | Alfa preservado | Feito | 7 | libvpx-vp9 na leitura e proxy VP9 para vídeo transparente. |
| X11 | Whisper e modelos conferidos | Feito | 8 | SHA-256 e tamanho fixados, retomada por Range (`src/main/download.ts`, `whisperAssets.ts`); `tests/download.test.ts`. |
| X12 | Loudness exato e ruído tratado por fonte | Feito | 5 e 7 | Duas passadas de loudness na exportação; voz tratada por fonte, em cache, igual na prévia e na exportação, com A/B. |
| X13 | Whisper com detecção de voz | Feito | 8 | `--vad` quando o `whisper-cli` lista a opção, filtro de alucinação em `whisperParse.ts` e 20 termos no prompt. |
| X14 | Trabalhos pesados no agendador e caches com teto | Feito | 4 e 7 | Vagas do agendador, caches LRU e limpeza das pastas `.edi-output` órfãs. |
| X15 | Texto do botão | Feito | 7 | "Adicionar à fila" e "Adicionando…" em `ExportDialog.tsx`. |
| X16 | Progresso, VTT e SRT | Feito | 7 e 8 | Progresso por fase e trecho, `webVtt()` no main e legendas de até 42 caracteres por linha (`captions.ts`). |

### IA, roteiro e automação (I1 a I19)

| # | Item | Estado | Lote | Observação |
| --- | --- | --- | --- | --- |
| I1 | Proposta presa ao projeto | Feito | 2 | `src/shared/anchors.ts`; proposta de outra aula é recusada; `tests/proposal-anchors.test.ts`. |
| I2 | Codex sem cmd.exe | Feito | 2 | Spawn sem shell e mensagem pela entrada padrão (`src/main/engineArgs.ts`); `tests/engine-args.test.ts`. |
| I3 | Claude Code pelo `.cmd` não trava o desfazer | Feito | 2 | Atalho do npm resolvido para o programa e `done` sempre emitido. |
| I4 | Limpeza protege a demonstração e "Limpar a aula" propõe | Feito | 6 | `src/shared/activity.ts` e imagem parada por `freezedetect`; a proposta é montada no computador, sem IA. |
| I5 | Limpeza por locutor | Feito | 6 | Vícios e repetições só na fala da professora; o apresentador nunca é cortado. |
| I6 | Repetição com distância máxima | Feito | 6 | Lacuna máxima entre tomadas, e demonstração no meio não conta como repetição. |
| I7 | IA respeita as escolhas do painel | Feito | 6 | `project.cleanup` e `cleanupPlan` únicos para o painel e a IA. |
| I8 | Desfazer por origem e turno preso à aula | Feito | 2 | `src/shared/history.ts`; `tests/history.test.ts`. |
| I9 | Sem foto velha sobrescrevendo | Feito | 2 | Escritas em fila (`src/shared/toolQueue.ts`) e estado relido no commit; `tests/tool-queue.test.ts`. |
| I10 | "Fora do roteiro" em português falado | Feito | 6 | `src/shared/ptSpeech.ts`, seção confirmada e recusa acima de 35%; `tests/script-align-pt.test.ts`. |
| I11 | Proposta ancorada na mídia | Feito | 2 | Âncora no tempo da mídia, chave de palavra e texto. |
| I12 | `transcribe` transcreve tudo o que falta | Feito | 2 | Sem duplicar a voz do vídeo do apresentador. |
| I13 | Configuração manual do MCP funciona | Feito | 2 | Trechos com o cabeçalho de autorização e `mcp-remote@0.15.1` (`SettingsModal.tsx`). |
| I14 | Codex restrito às ferramentas do editor | Feito | 2 e 15 | `src/main/mcpGuard.ts` encerra o processo que age fora do editor; autoteste por versão; `tests/mcp-guard.test.ts`. |
| I15 | Prompt pela entrada padrão | Feito | 2 | Sem limite de linha de comando nem texto lido como opção. |
| I16 | Modelo, esforço e consumo | Feito | 2 e 15 | `claude-opus-5-5` como padrão (`src/shared/aiModels.ts`), esforço sempre enviado, compactação, custo por pedido e transcrição em janelas de 10 min. |
| I17 | Token MCP com escopo e caminhos conferidos | Feito | 2 e 15 | Concessões com read, propose e write, validade e revogação (`packages/edi-desktop`); `src/main/aiPaths.ts` recusa rede e fluxos alternativos; `tests/ai-paths.test.ts`, `tests/ai-permissions.test.ts`. |
| I18 | Inserções respeitam faixa travada | Feito | 2 e 6 | `src/shared/inserts.ts` bloqueia o encaixe com faixa travada depois do ponto; `tests/inserts.test.ts`. |
| I19 | Núcleo da IA com testes | Feito | 2 a 15 | `engine-*`, `history`, `tool-queue`, `proposal-anchors`, `ai-*`, `mcp-guard`, `assistant-request`, `l15-ai-tools` e `l15-ia-review` em `tests/`. |

### Itens sem número

Os itens das listas de melhorias e do que faltava implementar recebem aqui o número da seção e a ordem em que aparecem: 1.2.1 é o primeiro item de 1.2. Em 2.2 o primeiro item é o E15, que já está na tabela acima.

| # | Item | Estado | Lote | Observação |
| --- | --- | --- | --- | --- |
| 1.2.1 | 60 fps, qualidade e resolução da aula | Feito | 10 | Opções do gravador e o preset "resolução da aula". |
| 1.2.2 | Região com presets, proporção travada, tamanho digitado e janela | Feito | 10 | `src/shared/region.ts`; `tests/region.test.ts`. |
| 1.2.3 | Zoom automático ao importar, editável e unificado | Feito | 10 | Mesmo painel e mesmo retângulo da camada de zoom; `tests/zoom-edit.test.ts`. |
| 1.2.4 | Microfone em faixa própria | Feito | 4 | Faixa "Voz" na importação. |
| 1.2.5 | Teleprompter com atalho e avanço pela voz | Feito | 4 e 5 | Ctrl+Shift+↓ e Ctrl+Shift+↑, passador de slides e `src/shared/voiceFollow.ts`. |
| 1.2.6 | Descartar o take sem fechar o gravador | Feito | 10 | Vai para a Lixeira, com confirmação. |
| 1.2.7 | Gravações dentro do projeto | Parcial | 1 e 13 | Continuam em `Documentos/EdiAula/Gravações`; reconectar mídia e o pacote da aula resolvem a mudança de PC. |
| 1.2.8 | Efeitos de cursor | Feito | 10 | Lupa, holofote, som de clique, halo na cor da paleta e efeito por trecho (`src/shared/clickSound.ts`). |
| 1.3.1 | Painel de saúde | Feito | 4 | Microfone, disco, quadros perdidos, cursor e "a máquina não acompanha". |
| 1.3.2 | Recuperar gravação interrompida | Feito | 4 | Ver G3. |
| 1.3.3 | Pausa sem parar a captura | Feito | 4 | Ver G6. |
| 1.3.4 | Gravar fala por fala | Feito | 5 | Modo Só voz com tomadas por fala (`src/shared/voiceTakes.ts`); a tomada repetida vira item da proposta de limpeza. |
| 1.3.5 | "Preparar aula" ao parar | Feito | 11 | `src/shared/prepare.ts`; `tests/prepare-order.test.ts`. |
| 1.3.6 | Gravar a plataforma pelo navegador do app | Feito | 9 | `src/main/guidedCdp.ts` e `guidedCapture.ts`; `tests/guided-cdp.test.ts`. |
| 1.3.7 | Zoom pelo conteúdo | Feito | 10 | Cursor de texto pelo auxiliar e detecção de cena no proxy. |
| 1.3.8 | Captura de janela | Parcial | 10 | "Janela…" encaixa a região na janela e a mantém à frente; uma janela coberta não é capturada (decisão técnica do plano). |
| 1.3.9 | Cursor real | Feito | 3 e 10 | Imagem do cursor guardada por hash pelo auxiliar. |
| 1.3.10 | Fundo da webcam por IA e enquadramentos | Feito | 10 | `src/shared/personKey.ts` e `cameraFraming.ts`; `tests/personKey.test.ts`. Três componentes do wasm aguardam a revisão jurídica (ver Pendências). |
| 1.3.11 | Desenho na tela durante a gravação | Feito | 10 | `src/shared/drawing.ts`; `tests/drawing.test.ts`. |
| 2.2.2 | Intervalo em todas as faixas, aparar com ripple e inserir empurrando | Feito | 12 | `src/shared/ripple.ts`; `tests/ripple.test.ts`. |
| 2.2.3 | Ímã em palavras, silêncios, marcadores e quadros | Feito | 12 | `src/shared/snap.ts`; `tests/snap.test.ts`. |
| 2.2.4 | Seleção por retângulo, à direita, da faixa e propriedades em lote | Feito | 12 | |
| 2.2.5 | Precisão de quadro e JKL com som | Feito | 12 | `media:audioSnippet`; `tests/scrub-snippets.test.ts`. |
| 2.2.6 | Miniaturas, fade, curva de volume e ruído com prévia | Feito | 5, 12 e 13 | `media:filmstrip`, envelope em `src/shared/gain.ts` e A/B da voz tratada. |
| 2.2.7 | Reordenar faixas, solo, valores numéricos, girar e espelhar | Feito | 12 | |
| 2.2.8 | Estender quadro em todas as faixas | Feito | 12 | |
| 2.2.9 | Modelos do curso, duplicar, renomear, cópia de segurança e formato | Feito | 12 | `reframeProject`; `tests/reframe.test.ts`, `tests/project-rename.test.ts`. |
| 2.2.10 | Portabilidade dos itens gerados | Feito | 12 e 13 | Itens gerados são refeitos quando somem; pacote da aula. |
| 2.2.11 | Testes de schema e IPC depois de cada operação | Feito | 1 | `tests/timeline-invariants.test.ts`. |
| 2.3.1 | Grupos | Feito | 13 | `src/shared/groups.ts`; `tests/groups.test.ts`. |
| 2.3.2 | Biblioteca entre projetos e favoritos | Feito | 13 | `src/shared/library.ts` e `userData/library.json`. |
| 2.3.3 | Editor de legenda e transcrição | Feito | 8 | `Asset.wordEdits`, quebras e estilo por legenda; `tests/wordEdits.test.ts`. |
| 2.3.4 | Desfoque e holofote de região | Feito | 13 | Desfoque, pixelado e holofote, seguindo a gravação. |
| 2.3.5 | Substituir mídia mantendo as edições | Feito | 13 | `src/shared/replaceAsset.ts`. |
| 2.3.6 | Marcadores e capítulos | Feito | 13 | `src/shared/markers.ts` e capítulos no MP4; `tests/markers.test.ts`. |
| 2.3.7 | Faixa magnética | Feito | 13 | `src/shared/magnetic.ts`. |
| 2.3.8 | Separar áudio do vídeo | Feito | 13 | Para cortes em J e L. |
| 2.3.9 | Envelope de volume e "destacar" faixa | Feito | 13 | `tests/gain-envelope.test.ts`. |
| 2.3.10 | Efeitos visuais | Parcial | 13 | Cor, moldura de notebook e de celular e fundo da aula (cor, gradiente ou imagem) em `src/shared/look.ts`; máscara e fundo animado não entraram. |
| 2.3.11 | Animação por palavra e seta que se desenha | Feito | 13 | `src/shared/reveal.ts`. |
| 2.3.12 | Verificação antes de exportar | Feito | 11 | `src/shared/preflight.ts`; `tests/preflight.test.ts`. |
| 2.3.13 | Revisão rápida dos cortes | Feito | 11 | `src/shared/seams.ts`; `tests/seams.test.ts`. |
| 2.3.14 | Navegação por palavra, frase e silêncio | Feito | 13 | |
| 2.3.15 | Quizzes para a plataforma | Feito | 14 | Quiz conferido dentro do `<aula>.plataforma.json`; sem SCORM. |
| 3.2.1 | Editor de legenda | Feito | 8 | Ver 2.3.3. |
| 3.2.2 | Qualidade por CRF ou CQ, com AQ e lookahead no NVENC | Feito | 7 | |
| 3.2.3 | Rascunho rápido com proxies e decodificação pela GPU | Parcial | 7 | Há o perfil "Rascunho para revisão" (720p), mas a exportação não lê os proxies nem decodifica pela GPU. |
| 3.2.4 | 60 fps | Feito | 10 | Gravação a 60 fps e projeto 1920 × 1080 a 60 fps. |
| 3.2.5 | HEVC e AV1 | Pendente | | A exportação sai só em H.264. |
| 3.2.6 | AMF e QSV no build | Feito | 3 | QSV pelo Media Foundation. Ver G10. |
| 3.2.7 | Cadeia de voz | Feito | 5 e 7 | `src/shared/voiceChain.ts`; `tests/voiceChain.test.ts`. |
| 3.2.8 | Redução de ruído por IA | Feito | 5 | `arnndn` com `resources/rnnoise/sh.rnnn`. |
| 3.2.9 | Parâmetros da limpeza visíveis | Feito | 6 | Pausa mínima e tipos no painel de Transcrição. |
| 3.2.10 | Vários formatos num clique e lote por curso | Parcial | 14 | Lote por curso feito (`src/shared/courseSplit.ts`); vários formatos num clique, não. |
| 3.2.11 | Fila que sobrevive ao fechar o app | Feito | 7 | `export-queue.json` com retomada. |
| 3.2.12 | Ducking configurável | Feito | 7 | |
| 3.2.13 | Escolha da miniatura | Feito | 14 | `set_thumbnail` e o cartão da plataforma. |
| 3.2.14 | Avatar recortado acima de 1920 px | Pendente | | `KEY_MAX_SIDE` continua em 1920 (`src/shared/chroma.ts`). |
| 3.3.1 | Reconectar mídia ausente | Feito | 1 | Ver E15. |
| 3.3.2 | Render por segmentos com cache | Feito | 7 | Ver X1; `tests/export-cache.test.ts`. |
| 3.3.3 | Exportar intervalo e quadro em PNG | Feito | 13 | `export:framePng`. |
| 3.3.4 | Projeto empacotado em zip | Feito | 13 | Ver A6 em "O que entrou além da análise". |
| 3.3.5 | Capítulos e título no MP4 | Feito | 7 e 13 | |
| 3.3.6 | Limpeza contextual com a IA | Parcial | 6 | Vícios, falsos começos e repetições pela regra local, e a IA propõe pela mesma limpeza (`find_cleanup`). Respiração não é tratada como item próprio. |
| 3.3.7 | Stems de voz e música | Feito | 13 | |
| 3.3.8 | Legendas traduzidas | Feito | 14 | `translate_captions` e arquivos `.<lang>.srt` e `.vtt`; `tests/caption-translate.test.ts`. |
| 3.3.9 | Dublagem | Fora por decisão | | Voz sintética ficou fora. |
| 3.3.10 | Ferramenta de exportação para a IA | Feito | 14 | `export_video` e `get_export_status`; `tests/export-video-tool.test.ts`. |
| 3.3.11 | Publicação direta | Fora por decisão | | O app prepara os arquivos e a subida é manual. |
| 4.2.1 | Proposta item a item, "ouvir pulando o corte" e salva no projeto | Feito | 2 e 11 | ReviewBar. |
| 4.2.2 | Correção da transcrição pelo glossário | Feito | 8 | `src/shared/glossary.ts`; `tests/glossary.test.ts`. |
| 4.2.3 | Limpeza consciente da tela e do locutor | Feito | 6 | Ver I4 e I5. |
| 4.2.4 | Ferramentas por chave de palavra | Feito | 2 | |
| 4.2.5 | Rascunho para qualquer edição da IA | Feito | 11 | `src/shared/projectDiff.ts`; `tests/projectDiff.test.ts`. |
| 4.2.6 | Alinhamento para português falado | Feito | 6 | Ver I10. |
| 4.2.7 | Inserções em lote e IDs no "Na tela" | Feito | 6 | "Encaixar todas" e `place_inserts`. |
| 4.2.8 | Narração guiada pelo roteiro | Feito | 14 | |
| 4.2.9 | Painel com progresso, custo e "o que mudou" | Feito | 14 | Ver A7 em "O que entrou além da análise". |
| 4.2.10 | Modelo de edição com regras | Feito | 11 e 12 | `src/shared/courseTemplate.ts` e `apply_editing_template`; `tests/course-template.test.ts`. |
| 4.3.1 | Do roteiro ao vídeo num clique | Feito | 11 | Preparar aula. |
| 4.3.2 | IA que vê o quadro | Feito | 14 | `get_frame` com região e limite de tamanho; `tests/frame-grab.test.ts`. |
| 4.3.3 | Verificação antes de exportar | Feito | 11 | Ver 2.3.12. |
| 4.3.4 | Regravação assistida das falas | Feito | 14 | `tests/retake-lines.test.ts`. |
| 4.3.5 | Falas do avatar pela API do HeyGen | Fora por decisão | | |
| 4.3.6 | IA paga da suíte | Fora por decisão | | Continuam a chave própria, o Claude Code e o Codex. |
| 4.3.7 | Aprender com a aula anterior | Feito | 14 | `src/shared/learning.ts`; `tests/learning.test.ts`. |
| 4.3.8 | Saídas para a plataforma | Feito | 14 | `src/shared/platformPackage.ts`; `tests/platform-package.test.ts`. |
| 4.3.9 | Lote por curso | Feito | 14 | `splitBySections` e "Produzir todas"; `tests/course-split.test.ts`. |

### O que entrou além da análise

| # | Item | Lote | Onde |
| --- | --- | --- | --- |
| A1 | Fluxo voz → apresentador → tela: gravar só a voz com teleprompter, tratar, limpar, exportar a voz em WAV com o mestre da voz, importar o vídeo do apresentador encaixado pela voz (correlação por FFT) e gravar a tela ouvindo a narração, com "Regravar a tela neste intervalo" | 5 e visual | `src/shared/audioSync.ts`, `voiceMaster.ts`, `presenterImport.ts`, `overNarration.ts` e `src/main/presenterVideo.ts`; `tests/presenterFlow.test.ts`, `tests/audioSync.test.ts` |
| A2 | Interface sem marca: o vídeo gerado fora do app é do "apresentador" (avatar ou pessoa) em botões, pastas ("Voz exportada") e clipes; aulas salvas com o valor antigo `heygen` abrem com o novo | visual | `1026dc3f`; `Clip.mutedFor: "presenter"` em `src/shared/project-normalize.ts` |
| A3 | Modo "Voz e câmera": tudo do Só voz com a câmera num processo próprio; a voz vai para "Voz" e o vídeo para "Apresentador", mudo e alinhado | visual | `1026dc3f`, `0f5020f3`; `src/shared/compose.ts`, `src/shared/prepare.ts` |
| A4 | Áudio do PC sem nenhum som do app: process loopback do WASAPI no auxiliar, excluindo a árvore de processos do EdiAula, com reserva pelo Chromium | visual e 10 | `native/helper/AudioLoopback.cs`, `src/shared/systemAudio.ts`; `tests/systemLoopback.test.ts` e `tests/systemAudioExclusion.test.ts` (com `EDIAULA_SOUND_TESTS=1`) |
| A5 | Desenho na tela com caneta, marca-texto e seta, quadro branco e quadro negro, página nova e desfazer, importados como clipes "Desenho" e "Quadro" | 10 | `src/shared/drawing.ts`, `src/main/drawingVideo.ts`; `tests/drawing.test.ts`, `tests/board.test.ts` |
| A6 | Pacote da aula: projeto com as mídias em ZIP64, índice conferido antes de extrair, caminhos só dentro de `media/` e id novo ao abrir | 13 | `src/shared/projectPackage.ts`, `src/main/zip.ts`; `tests/zip-package.test.ts`, `tests/package-safety.test.ts` |
| A7 | Assistente do Lote 14: etapa e porcentagem de cada ferramenta, cancelar a ferramenta em curso, custo, "O que mudou" com "Ir até" e "Desfazer este pedido", conversa guardada por aula e texto do Codex aos poucos | 14 | `src/renderer/src/editor/AssistantPanel.tsx`, `src/renderer/src/state/assistant.ts`, `src/main/conversations.ts` |
| A8 | Teste visual de ponta a ponta com mídia sintética, perfil isolado e uma passada em 1366 × 768, que falha com qualquer erro de página, de console ou de IPC | teste visual e visual | `scripts/edi/visual-ediaula.mts`, `scripts/edi/native-harness.mts` |
| A9 | Revisão geral do lote 15, em três partes, todas com as correções na branch. **IA** (`376f9278`): histórico sem edição local, resultados antigos limpos pela API, Parar que responde às ferramentas pendentes, projeto da chamada fixado na entrada, capítulos numa fonte só, `ai.json` gravado de forma atômica e tokens que vencem 30 dias depois do último uso. **Editor e exportação** (`030374ad`): seguir a gravação resolvido por instante, igual na prévia e na exportação (`PLAN_VERSION` 3 invalida os trechos de antes), trechos iguais renderizados uma vez, som separado marcado como `soundOnly`, faixa magnética com o grupo, zoom e keyframes como soma de rampas, cor na faixa limitada, imagens dos cursores no pacote, projeto salvo compacto e abrir e salvar só com `.ediaula` escolhido pela pessoa. **Gravação** (`4d3fd4b9`): arrasto do guiado que nunca deixa o botão preso, regravação do intervalo que tira câmera, áudio do PC e desenho do take antigo, descarte confirmado dentro da pílula, pausas anotadas em cada mídia e fora do pacote, diário que vai ao disco na hora, áudio do PC nativo que reabre sozinho, modos de tela só no Windows 10 2004 ou mais novo, ajustes de copy e acessibilidade e os avisos de terceiros do wasm e do `arnndn` copiados das fontes oficiais | 15 | `376f9278`, `030374ad`, `4d3fd4b9`; `tests/l15-ia-review.test.ts`, `tests/l15-ai-tools.test.ts`, `tests/zip-package.test.ts`, `tests/package-safety.test.ts` |

## Decisões registradas

- **Escopo, pela titular em 17/10/2026.** Ficam fora a IA paga da suíte (continuam a chave própria, o Claude Code e o Codex), as falas do avatar pela API do HeyGen, a voz sintética (overdub e dublagem) e a publicação direta. A tradução de legenda entrou, pelo motor de IA já configurado. O fluxo real dela é gravar a voz, gerar o vídeo do avatar fora do app (ela usa o HeyGen), importar o vídeo, gravar a tela sobre a voz, editar e subir manualmente na plataforma do Sistema Zero. Nada depende de serviço externo pago.
- **Interface sem marca, pela titular em 18/10/2026.** Nenhum título, botão, pasta ou clipe cita marca: quem aparece no vídeo importado é o "apresentador". O HeyGen aparece só em documentos, como exemplo, e num comentário de código que explica o padrão de 5 min por arquivo (limite de 32 MB do envio dele).
- **"Voz e câmera" é um modo próprio** ao lado de Só voz, e não uma opção dentro dele (titular, 18/10/2026).
- **RNNoise mantido (titular, 18/10/2026).** O modelo `sh.rnnn` (GregorR/rnnoise-models) não traz arquivo de licença; o autor declara no README dele que os modelos não têm direito autoral (`resources/rnnoise/README.md`). O modelo entra na revisão jurídica geral pendente antes do lançamento. Se o jurídico pedir, a troca é pelo `afftdn` com perfil aprendido no trecho mais quieto, caminho que já existe e é testado (`src/shared/voiceChain.ts`).
- **Léxico do glossário.** A lista de 48 mil palavras vem do FrequencyWords `pt_br_50k`, licença CC BY-SA 4.0, com a atribuição em `src/shared/lexicon/LICENSE-pt-words.txt` e no `THIRD-PARTY-NOTICES` do EdiAula (`1fa64422`).
- **Decisões técnicas do plano.** Um executável próprio em C# 5 (`ediaula-helper.exe`, compilado pelo `csc.exe` do .NET Framework 4.x) no lugar dos dois `.ps1`; captura contínua, com a pausa virando corte; diário em disco e recuperação; cadeia de codificador NVENC, AMF, Media Foundation e x264; exportação por trechos com cache; modo guiado da plataforma web pelo Chrome DevTools Protocol, em resolução fixa; "Janela" é a região encaixada no retângulo da janela e mantida à frente, sem captura de janela coberta.

## Pendências

### Publicação da 0.1.5 parada no teste da voz tratada

Em 18/10/2026 o trabalho entrou na `main` pelo PR #19 (`f488e68`) e a tag `edi-v0.1.5` disparou a [publicação](https://github.com/informach/informach-apps/actions/runs/39169544085). Ela parou duas vezes no job `media / verify`, antes dos instaladores e do `publish`, sempre com os mesmos números, no teste `voz tratada` de `apps/ediaula/tests/voiceChain.test.ts`: o chiado sob a fala, que sem a redução fica 20,5 dB abaixo da voz, foi para 28,3 dB (pede pelo menos 30,5); a pausa ficou em -49 dBFS e o pico em -1,1 dBFS.

O que já se sabe:

| Onde | FFmpeg | Resultado |
| --- | --- | --- |
| Esta máquina (AMD Ryzen 5 5600G) | compilado localmente e o compilado pela publicação, baixado do artefato | 42,3 dB, pausa -66 dBFS, pico -3,3 dBFS, sempre igual (mais de 60 rodadas, inclusive em paralelo) |
| Runner do PR #19, segunda rodada | reaproveitado do cache da primeira rodada | 42,3 dB, passou |
| Runner da publicação (duas rodadas) | compilado do zero no workflow | 28,3 dB, falhou |
| Runner do PR #20 (AMD EPYC 7763, sem AVX-512) | compilado do zero no workflow | 28,3 dB, falhou |

- A receita do FFmpeg é a mesma (`recipeDigest` `e23b5edd…`), mas o build não é reproduzível: o `ffmpeg.exe` da publicação tem outro sha256 que o local, com o mesmo tamanho. Mesmo assim, o executável da publicação dá o resultado bom nesta máquina.
- A hipótese do AVX-512 foi descartada pelo PR #20: o EPYC 7763 não tem AVX-512 e falhou igual.
- Uma única rodada local, entre umas 60, deu um resultado do `arnndn` completamente diferente das outras e não se repetiu. Pode haver um não determinismo raro no filtro.
- O teste agora registra o processador no log (`processador …`), para comparar as rodadas.

**Decisão da titular (18/10/2026):** publicar com o recurso como está e deixar essa medida como aviso no CI, sem bloquear. O teste continua rodando e escreve `AVISO: redução do chiado de … dB` no log quando fica abaixo de 10 dB; fora do CI (nesta máquina e nas de desenvolvimento) ele continua falhando. A próxima versão sai pela tag `edi-v0.1.6`. Quando a causa for encontrada e corrigida, o teste volta a bloquear também no CI.

Próximo passo: comparar as entradas da cadeia entre o runner e esta máquina. Gravar como artefato do job o `cadeia`, o `level`, o trecho silencioso escolhido e o WAV intermediário, e rodar só `voiceChain.test.ts` num runner com o FFmpeg do cache e com o compilado do zero. Só depois decidir entre corrigir a cadeia, fixar o build do FFmpeg ou trocar o critério do teste. A tag da próxima tentativa precisa ser nova (`edi-v0.1.6` ou seguinte).

**Atualização de 19/10/2026, ainda sem validação remota:** durante a verificação do [PR #24](https://github.com/informach/informach-apps/pull/24), duas execuções Windows inverteram qual das duas chamadas do mesmo bundle FFmpeg produzia 28,3 ou 42,3 dB. Um ensaio controlado com a fonte fixada do FFmpeg 9.0.2 demonstrou que o filtro `arnndn` lê padding não inicializado dos vetores de entrada da rede recorrente: preencher essas posições com NaN reduziu o ganho a 4,4 dB, enquanto zerá-las antes do cálculo trouxe 21,8 dB, mantendo a exigência original de pelo menos 10 dB. A receita de mídia do PR inicializa os três buffers, inclui a alteração nas fontes correspondentes e eleva a versão do cache de voz para 3. O binário reconstruído passou localmente no teste focado e na suíte de mídia, além da conferência de recursos do pacote EdiCaptura. A exceção temporária acima foi removida **na branch do PR #24**; o teste volta a bloquear também no CI. Os novos jobs Windows ainda precisam confirmar a correção no remoto. O preflight de áudio físico do mesmo PR apenas registra se o runner tem saída padrão ativa; sem ela, cinco casos ficam explicitamente não exercitados, sem alegação de homologação física.

### Testes locais da verificação final (para a próxima sessão)

Em 18/10/2026 a verificação final da branch integrada (`6e55f459` e a documentação depois dele) passou em `pnpm typecheck`, `pnpm check`, `pnpm exec turbo test`, no build das seis ferramentas Edi e em `pnpm edi:test:tooling`. Os dois testes que abrem o Electron foram interrompidos por falta de memória nesta máquina, e a titular decidiu publicar e rodá-los depois, numa máquina com mais memória:

- **`pnpm edi:test:visual`:** só roda localmente (não há workflow). Passou nas branches dos lotes antes da integração (159 capturas no Lote 10 e 132 no Lote 13, zero erros), mas não sobre a branch integrada com as correções da revisão geral. Rodar sobre a `main` publicada, olhar as capturas que mudaram (gravador, pílula com a confirmação de descarte, quadro no editor, região seguindo a gravação, cor) e corrigir o que falhar.
- **`pnpm edi:test:native`:** roda no workflow `edi-native` do PR e da `main` e no `edi-release` de cada app; localmente ficou sem rodar sobre a branch integrada. Rodar também `pnpm --filter @informach/ediaula test` com `EDIAULA_NATIVE_INPUT_TESTS=1` (entrada real do auxiliar, inclusive soltar o botão no fim do modo de entrada, mudado no lote 15) e com `EDIAULA_SOUND_TESTS=1` (áudio do PC sem o som do app).
- Os dois esperam 2000 MB livres. Feche outros programas pesados antes.
- **Segmentação da webcam no CI:** no runner Windows do GitHub, que não tem GPU, o wasm do MediaPipe aborta (`Aborted()`) no teste `personKey`, que passa nesta máquina. O teste fica pulado no CI (`process.env.CI`). Reproduzir numa máquina ou VM sem GPU antes de depender do recurso: se abortar lá, o fundo removido por IA precisa de um aviso claro ou de outro caminho nesses computadores.

### Teste manual

- **Intel e AMD:** gravar e exportar por AMF, Media Foundation e QSV numa máquina de cada fabricante. Esta máquina só tem NVIDIA; o detector e o plano B foram testados só com NVENC e x264.
- **AppLocker:** abrir o gravador e o modo guiado num PC com AppLocker ou Constrained Language Mode, como os de escola.
- **Defender:** varredura e comportamento do antivírus com o `ediaula-helper.exe`, que instala ganchos de mouse e teclado e não tem Authenticode.
- **Take de 20 min com claquete:** medir a deriva entre microfone, tela e câmera e o atraso de abertura da câmera (G9). O teste automático usa flash e bipe sintéticos.
- **Segmentação da webcam com pessoa real:** o teste usa vídeo sintético (máscara não vazia e alfa no arquivo). Falta uma gravação real com uma pessoa na frente da câmera, com cabelo, mãos e fundo comum.
- **Uso real das telas novas:** elas passaram por typecheck, build e pelo teste visual com mídia sintética; nenhuma foi usada pela titular numa aula de verdade.

### A implementar

- **Apagar a pausa nos arquivos originais do take.** Como a captura continua durante a pausa, o que a câmera, a tela e o microfone gravaram nesses segundos fica nos arquivos da pasta da gravação. Desde `4d3fd4b9` esse conteúdo não volta ao editor (nenhum aparo entra nos segundos pausados) nem sai no pacote da aula (as mídias vão com a pausa em preto e silêncio, e a transcrição sem as palavras ditas ali), e o editor avisa ao importar. Apagar nos próprios arquivos ficou pendente pelo custo: refazer a tela leva cerca de um terço da duração do take (2 min de 1080p30 levaram de 35 a 39 s nesta máquina), uns 20 min para uma aula de uma hora, com mais uma perda de qualidade e o dobro de disco enquanto roda.
- **E14, HEVC e AV1, avatar acima de 1920 px** e os parciais das tabelas acima.

### Revisão jurídica

Antes do lançamento, junto com a revisão jurídica geral já registrada para os textos legais:

- o modelo RNNoise sem arquivo de licença (ver Decisões registradas);
- o léxico CC BY-SA 4.0 embutido no renderer, que pede atribuição e compartilhamento pela mesma licença;
- os componentes compilados dentro do WebAssembly do `@mediapipe/tasks-vision` 1.0.1, que roda a segmentação da webcam. O aviso `resources/segmentation/WASM-NOTICES.txt`, desde `4d3fd4b9`, traz as bibliotecas achadas nos arquivos com as versões fixadas pela tag v1.0.0 do MediaPipe e os textos de licença copiados das fontes oficiais. Ficam pendentes para a revisão jurídica ML Drift, gloop e a infraestrutura ODML, para os quais não se achou código-fonte nem licença públicos; o Google distribui o pacote inteiro como Apache 2.0.

### Limites conhecidos

- **Windows anterior ao 10 versão 2004 (build 19041):** nele o Windows não deixa a janela do gravador fora da captura, só a pinta de preto, e a gravação sairia preta. Os modos que gravam a tela (Tela, Tela sobre a narração e o guiado na tela) recusam começar, com aviso (`screenCaptureProblem` em `src/shared/systemAudio.ts`, chamado em `src/main/recorder.ts`). Só voz e Voz e câmera não gravam a tela nem o áudio do PC e seguem funcionando. Como o áudio do PC só existe nos modos de tela, ele também não grava nesses Windows.
- **Reserva do áudio do PC:** se o process loopback do auxiliar não abrir no começo do take, o áudio do PC cai para o Chromium com `restrictOwnAudio`, que exclui só a janela que captura. O som de outra janela do EdiAula entra na faixa (medido nesta máquina: -13 dB, contra cerca de -83 dB pelo auxiliar). Nos modos em que o gravador toca uma voz, sem a exclusão confirmada, o áudio do PC fica desligado com aviso (`systemAudioPlan`).
- **Janela coberta:** "Janela…" grava a região da tela, então o que estiver por cima da janela escolhida entra no vídeo.
- **Avatar acima de 1920 px:** a remoção de fundo trabalha até 1920 px no lado maior (3.2.14).
- **FFmpeg de desenvolvimento:** no FFmpeg 6 dos wrappers de desenvolvimento a voz é tratada pelo `afftdn`, porque o `arnndn` deu resultados diferentes para o mesmo arquivo; o app instalado usa o RNNoise do FFmpeg 9.0.2 do pacote. A voz soa diferente nos dois.
- **Sem Authenticode:** a suíte é verificada por Ed25519, que não identifica um publicador para o Windows (`docs/arquitetura-desktop.md`).

### Riscos registrados pelos lotes

- **Áudio do PC nativo com três novas aberturas por take.** Desde `4d3fd4b9`, se o `ediaula-helper.exe` do loopback parar no meio, a gravação segue, o aviso aparece e a captura abre de novo na hora, numa parte nova alinhada pela primeira amostra dela; numa pausa, abre com a retomada (`MAX_LOOPBACK_REOPEN` em `src/main/recording/session.ts`). Depois de três novas aberturas no mesmo take, uma nova queda deixa o resto dele sem o áudio do PC, e o trecho entre cada queda e a parte seguinte vira silêncio.
- **Janela mantida à frente depois de uma queda.** A janela posta por cima fica anotada no perfil (`janelas-na-frente.json`) e volta ao normal na próxima abertura se o app e o auxiliar caírem juntos, mas só se o computador não tiver reiniciado no meio (`4d3fd4b9`).
- **Cursor de texto liga a acessibilidade do Chromium.** Para o zoom que segue a digitação, o auxiliar lê o cursor de texto pela automação de interface; no Chrome e em apps Electron isso liga a árvore de acessibilidade inteira e custa velocidade ao programa gravado (`native/helper/Caret.cs`). Só roda com o zoom automático ligado nas opções do gravador.
- **Edição de contexto da API não provada contra a API real.** A limpeza de resultados antigos (`clear_tool_uses_20250919`) e a compactação (`compact_20260112`), com os betas `context-management-2025-06-27` e `compact-2026-01-12` (`src/shared/aiModels.ts`), foram conferidas só pelo formato do pedido (`tests/assistant-request.test.ts`, `tests/l15-ia-review.test.ts`), nunca numa chamada à API da Anthropic.
- **Codex conferido por versão.** A restrição depende da lista de eventos permitidos e do `codex features list` da versão instalada (`dbe320d8`); uma versão nova que mude os eventos faz o processo ser encerrado ou o autoteste falhar até a lista ser atualizada.
- **VAD pelo log do whisper.** Os tempos com VAD voltam ao arquivo pela tabela `vad_segment_info` do log do `whisper-cli`; sem ela, a transcrição é refeita sem VAD (`21400ed8`).
- **Modo guiado e páginas de outro site.** Quadros de outro site dentro da página da aula não são lidos (a marcação avisa), e abrir o DevTools desliga a automação (`5895ab10`, `416e6145`).
- **Encaixe do vídeo do apresentador.** Com confiança baixa ou dois arquivos que servem igual, o vídeo não entra sozinho e vira palpite para conferir; um vídeo com som muito diferente da voz exportada pode não encaixar.
- **Remoção de fundo da webcam:** custa cerca de 12 ms por quadro a 256 px, em segundo plano; numa máquina lenta, a fila de trabalho demora mais depois da gravação.
