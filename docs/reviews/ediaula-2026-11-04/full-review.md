# EdiAula: full review de 04/11/2026

Pedido do titular: verificar as implementações e fazer um full review do EdiAula. Base: `main` em `bbf799f9`, mais a mudança ainda não commitada de arrastar anotações para a timeline (`src/shared/dropSpot.ts`). O review foi só de leitura, dividido em quatro frentes: a lógica compartilhada do commit `55204832`, as ferramentas da IA desse commit, a segurança do processo principal e o caminho de gravação e exportação. Os achados graves foram conferidos de novo no código antes da correção.

## Verificações

| Verificação | Antes | Depois das correções |
| --- | --- | --- |
| `pnpm --filter @informach/ediaula typecheck` | passou | passou |
| `pnpm --filter @informach/ediaula test` | 1.064 aprovados, 0 falhas, 16 pulados | 1.079 aprovados, 0 falhas, 16 pulados |
| Biome nos arquivos alterados | 35 avisos, 0 erros | 35 avisos (os mesmos), 0 erros |

Os 16 pulados são os testes físicos opt-in. O Biome do app inteiro tem 205 avisos antigos (183 de `noNonNullAssertion`), nenhum erro.

## Corrigidos

| # | Achado | Correção | Teste |
| --- | --- | --- | --- |
| 1 | `place_inserts` com linhas kids e falas do avatar na mesma chamada: o plano do avatar trocava clipes e faixas da aula inteira e apagava as linhas kids, dizendo que as duas entraram. | As falas do avatar são planejadas sobre a aula já com as linhas kids (`substitutionPlan` em `lib/aiTools.ts`). | `tests/l15-ai-tools.test.ts` (Farol, seção 4, com tabela kids) |
| 2 | Cancelar a exportação em "Preparando…" podia ser ignorado: sem cliques, nada conferia o cancelamento antes de `export:start`, e o main ainda não tinha o job para cancelar. O arquivo escolhido era sobrescrito com o item marcado como cancelado. | `check()` logo antes de `startExport` (`state/exportQueue.ts`). | `tests/export-cancel.test.ts` |
| 3 | Finalização: um arquivo novo (`tela.mp4`, `microfone.m4a`/`voz.wav`, `sistema.m4a`) com duração errada continuava valendo, as partes ficavam sem referência e o take era marcado como finalizado. | Num take que terminou limpo, o arquivo é descartado e o take fica nas partes, colocadas pedaço a pedaço. Com partes suspeitas (queda), a duração delas pode ser a do cabeçalho: aí o arquivo novo continua valendo e as partes ficam (`recording/finalize.ts`). | `tests/recording-preservation.test.ts` (novo caso; os dois casos de queda em Matroska continuam passando) |
| 4 | Segurança: abrir um `.ediaula` punha a aula nos recentes antes da pergunta de permissão. Os recentes liberam a miniatura sem perguntar, então um caminho `\\servidor\…` na miniatura vazava o hash de login do Windows a cada abertura do Início, mesmo depois de **Cancelar**. A pergunta listava 20 caminhos e liberava todos. | A aula entra nos recentes só depois da permissão (`remember` em `index.ts`). A pergunta nomeia todos os computadores da rede e conta todos os arquivos fora da pasta da aula, resolvendo `..`. Caminhos de dispositivo são recusados (`src/main/linkedFiles.ts`). | `tests/linked-files.test.ts`, `tests/project-files.test.ts` |
| 5 | Faixas magnéticas: `move_clips`, `align_track_to`, `add_clip` e `import_media` com `track_id` ignoravam o ímã. O commit reempacotava a faixa e a resposta citava tempos que não existiam. | `planMoves` recusa um resultado que o ímã desfaria. `placeWithoutRipple` não usa faixa magnética para um tempo exato e diz por quê (`shared/clipMoves.ts`, `shared/soundPlacement.ts`). | `tests/clip-moves.test.ts`, `tests/sound-tools.test.ts` |
| 6 | `align_track_to` chamado duas vezes cortava de novo a faixa já alinhada e estragava a sincronia do avatar. | Uma faixa com mais de 0,2 s de pausas entre os clipes é recusada. | `tests/clip-moves.test.ts` |
| 7 | Os cliques abaixavam sob a fala de um jeito na prévia (palavras) e de outro na exportação e na medição de volume sem música (o clipe inteiro). | `needsSpeech` em `shared/audio.ts`, usado pelos três. | `tests/audio.test.ts` |
| 8 | Anotação arrastada para a faixa da voz ia para uma faixa de som abaixo da tela e ficava escondida; numa faixa magnética saía do tempo solto. | `dropSpot` só usa faixa de vídeo, nem travada nem magnética; vinda de uma faixa de som, vai para a frente da imagem daquele momento. | `tests/drop-spot.test.ts` |

## Pendentes

Ordenados por gravidade. Confirmados pela leitura do código, salvo quando marcado como plausível.

**Ferramentas da IA (`lib/aiTools.ts`)**
- `set_click_sound enabled:false` não desliga trechos que ligam o clique localmente (`cursorFx.ranges[].fx.clickSound`).
- O esquema de `set_volume` exige `volume`, embora a descrição diga que `mute:true` basta.
- Modo rascunho:
  - os ids devolvidos não são os que ficam no rascunho, porque o recálculo chama `newId` de novo;
  - a mesma mídia entra duplicada em duas propostas;
  - `add_sound_effects` mede a fala na aula, e não no rascunho;
  - um segundo `align_track_to` em rascunho é sempre recusado.
- `remove_track` apaga a faixa Cliques (ela nunca tem clipes), e os cliques continuam soando sem faixa para silenciar. Plausível.
- `import_media` sem `at` não entra num passo só do desfazer: a mídia fica na biblioteca depois do Ctrl+Z.
- `set_voice_role` com `media` ignora faixas travadas. Plausível.
- `align_track_to` lista cortes que não aconteceram, nos vãos e a menos de `MIN_CLIP` de uma borda. Só afeta a mensagem.
- O espaçamento dos cliques acima de 2× conta cliques de outras faixas (`clickEvents.ts`). Plausível, menor.

**Gravação e exportação**
- `repair()` sobrescreve a parte original com um remux que não é conferido (`finalize.ts`). Plausível.
- Uma falha do FFmpeg ao juntar a tela ou alinhar o som faz `finalizeTake` lançar sem cair para as partes, e a recuperação repete a falha. Plausível.
- A duração de uma parte suspeita vem do cabeçalho do contêiner: um MKV morto aos 2 s de 20 s planejados mede 20 s. Isso foi visto ao corrigir o item 3, e a duração do take pode sair maior que a gravação.
- A limpeza do cache de voz (`cachePrune.ts`) pode apagar uma voz tratada que a exportação vai usar, e um `EBUSY` ali faz o tratamento parecer falho. Plausível.
- `ffmpegListing` (listar câmeras) não tem tempo limite: uma câmera virtual travada prende `recorder:prepare`. Plausível.
- Na exportação, as pistas separadas de voz e música são gravadas fora da área temporária e não voltam atrás se a exportação falhar depois. Uma queda deixa `*.part.wav` ao lado dos arquivos da pessoa.
- `proxy.part.mp4` fica para trás depois de uma falha ou de um cancelamento, e o `cachePrune` não cobre essa pasta.
- Uma gravação guiada cujo codificador cai não é marcada como suspeita na finalização. Plausível.

**Segurança (precisam de renderer já comprometido, ou são só reforço)**
- `media:motion` e `shell:showItem` não conferem o caminho.
- No `@informach/edi-desktop` (`files.ts`), `assertRead` e `canRead` resolvem o caminho (`realpath`) antes de conferir a permissão; recusar caminhos de rede e de dispositivo no `pathSchema` fecharia isso para toda a suíte.
- O `setWindowOpenHandler` da janela principal manda qualquer URL para `shell.openExternal`, sem lista de esquemas permitidos.

## Conferido sem defeito

- Isolamento das janelas: `sandbox`, `contextIsolation`, sem `nodeIntegration`; janelas remotas sem preload.
- Remetente e validação de todo IPC, e extração de pacote sem zip-slip.
- MCP só em 127.0.0.1, com token e guarda de ferramentas.
- Downloads do Whisper fixados por SHA-256.
- FFmpeg e `tar.exe` sem shell.
- Diário da gravação: linhas duráveis e escrita atômica.
- Cache de trechos: escrita via `.part` e renomeação, trechos em uso fixados contra a limpeza.
- Fila de exportação: uma exportação de cada vez.
- Bordas de trechos e áudio exatos no quadro e na amostra.
- `split_clip` e as conferências de faixa travada e de ids nas ferramentas novas.
- Regra "personagem silencia a professora": igual na prévia e na exportação.

## Limites

Não houve teste manual no app aberto nem gravação real. As correções de interface (arrastar anotação, pergunta de permissão) só foram exercitadas por testes unitários.
