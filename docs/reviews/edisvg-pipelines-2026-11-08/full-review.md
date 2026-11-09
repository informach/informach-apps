# Pipelines do EdiSVG: full review de 08–09/11/2026

Lote 6 do [plano dos pipelines](../../propostas/edisvg-pipelines-2026-11-08/plano.md). O review
cobriu os commits dos lotes 0 a 5 (`74f85d72` a `bec6950d`):
- a importação do Estúdio;
- o pacote `@informach/edi-speech`;
- as receitas;
- o trecho no áudio e a narração;
- a receita da Cena;
- a receita da demonstração e a camada transparente.

Ele foi feito por um agente independente, só leitura, e cada achado foi conferido no código antes
da correção.

## Corrigidos

| # | Achado | Correção | Teste |
| --- | --- | --- | --- |
| 1 | Cancelar a transcrição não parava o Whisper nem a medição de silêncios. Pior: se o cancelamento caía durante a detecção de voz, o executor tratava o processo morto como modelo de VAD quebrado, apagava o `ggml-silero` da pasta do EdiAula e transcrevia tudo de novo, e uma transcrição incompleta podia ir para o cache do EdiAula. | Cada tarefa tem um `AbortController` no processo principal, e o sinal chega ao `transcribe` (como o EdiAula já fazia). Cancelar aborta o sinal, o Whisper e o FFmpeg da tarefa. | jornada nativa; leitura do caminho do sinal em `createWhisper` |
| 2 | Abrir ou criar um projeto durante a execução fazia as etapas seguintes editarem o arquivo novo. | O início guarda a sessão do projeto. Toda edição do pipeline recusa outra sessão, e abrir ou criar projeto espera o pipeline terminar ou ser cancelado. | e2e (um Ctrl+Z) |
| 3 | "Um Ctrl+Z" falhava quando o histórico descartava a marca: com 100 passos ou 32 MB, o estado anterior ficava inalcançável. | Durante a execução, cada edição é juntada à marca no momento em que acontece. A execução ocupa sempre um passo, e a marca nunca é descartada por ela. | `history.test.js`, e2e |
| 4 | Fechar o painel no meio deixava a execução trabalhando escondida, e as edições da pessoa nesse meio-tempo entravam no passo único do pipeline. | Enquanto roda, o painel não fecha (nem pelo × nem pelo Esc); a parada é por Cancelar. O fim só junta passos na sessão em que começou. | e2e |
| 5 | Cancelar enquanto os quadros do vídeo eram extraídos ainda pedia o rascunho ao assistente. | Toda tarefa do processo principal passa por `job()`, que confere o cancelamento antes e depois, e há uma conferência antes de chamar o assistente. | unitário do executor |
| 6 | A leitura de uma aula do EdiAula incluía vozes que o EdiAula não ouve: faixa de música, de efeitos ou de cliques, clipe silenciado para outra voz (`mutedFor`) e mídia sem áudio. Isso duplicava palavras e dava eco na narração. | As mesmas exclusões do EdiAula (`shared/audio.ts`). | `pipelineMedia.integration.test.ts` |
| 7 | O cursor de uma gravação só era achado no nome `<id>-cursor.json` do pacote da aula, e não no `cursor.json` da pasta da gravação. Além disso, `aula-final.mp4` pegava um `aula-cursor.json` qualquer. | `<id>-cursor.json` só quando o vídeo tem o nome `<id>-<id>-…`. O `cursor.json` da mesma pasta também vale. | `pipelineVideo.integration.test.ts` |
| 8 | O README prometia reaproveitar a transcrição do EdiAula, mas o nome do arquivo depende do glossário e quase nunca batia; a aula era transcrita de novo. | Uma transcrição em português já feita para o arquivo (com qualquer glossário, com ou sem detecção de voz) é lida antes de transcrever. | `pipelineMedia.integration.test.ts` |
| 9 | O corte da narração, a prévia do vídeo e os quadros não podiam ser cancelados. | As três etapas recebem um identificador de tarefa, que Cancelar interrompe. | jornada nativa |
| 10 | Uma imagem malformada no projeto do Estúdio interrompia a importação inteira com um erro técnico. | A leitura de cada imagem fica dentro da sua própria proteção; a imagem com problema é listada como não importada. | leitura |
| 11 | O nome sugerido trazia o início só em segundos inteiros (até 1 s fora de sincronia). A camada "transparente" podia sair opaca, se a sequência PNG estivesse com cor de fundo. A narração e o vídeo de referência ficavam na memória depois de trocar de projeto. | O início vai com décimos ("2m15,7s"). A camada é sempre transparente. Trocar de projeto descarta a narração e o vídeo de referência. | leitura, jornada nativa |

## Sem problemas encontrados

- **Entradas da comunicação entre processos:** tokens por tipo de arquivo, segundos, tempos, FPS, identificadores e nome de arquivo limitados.
- **Contas de tempo:** aula → animação (com o fôlego antes), deslocamento do vídeo, quadros dos cliques e das frases.
- **Velocidade de clipe:** conta igual à do EdiAula.
- **Extração do EdiAula:** os arquivos movidos são idênticos, fora as asserções `!` e os imports. O `createWhisper` mantém o comportamento.

## Segunda rodada (09/11/2026)

Depois do lote 6, dois agentes independentes, só leitura, revisaram de novo os sete commits: um o
processo principal e o `@informach/edi-speech`, outro o renderer. Cada achado foi conferido no
código; três deles mostraram que correções da primeira rodada (#3, #4 e #11) estavam incompletas.

| # | Achado | Correção | Teste |
| --- | --- | --- | --- |
| 12 | Qualquer Ctrl+Z ou Ctrl+Y apagava a narração e o vídeo de referência: a correção #11 os descartava em `applyProject`, que o desfazer também usa. | Só abrir ou criar outro projeto os descarta. | e2e (edição depois da execução, Ctrl+Z, a narração continua) |
| 13 | Desfazer durante a execução (Ctrl+Z, menu Editar, ferramenta `undo` do assistente no rascunho) voltava tudo o que a execução já tinha feito. | Desfazer e refazer esperam a execução; o assistente recebe a explicação. | leitura |
| 14 | A marca ainda podia ser descartada pelo limite de 32 MB: o descarte acontecia no `commit`, antes da junção. | `commit(next, joinTo)` junta os passos à marca antes dos limites, e os limites nunca descartam a marca. | `history.test.js` (orçamento pequeno) |
| 15 | Uma execução podia se misturar a outras edições: começar com o assistente respondendo, ou importar SVG ou projeto do Estúdio pelo menu no meio. | O pipeline não começa com o assistente ocupado; as importações esperam a execução. | leitura |
| 16 | No Chromium, um segundo Esc fecha o diálogo mesmo com o `cancel` impedido, e a execução continuava escondida. | Durante a execução o diálogo fica com `closedby="none"`; se fechar mesmo assim, ele abre de novo. | leitura |
| 17 | Projeto do Estúdio com nomes de mais de 120 caracteres, textos longos, palco fora do limite ou posições enormes era recusado no meio, com as partes anteriores já aplicadas e mensagens em inglês do navegador. | Nomes, textos, palco, posições e tamanhos ficam dentro dos limites do editor. A importação em partes é tudo ou nada, num passo de desfazer, e os erros saem em português. | leitura |
| 18 | A receita da Cena num projeto sem palco animava uma prancheta de imagem. | A etapa para e explica. | leitura |
| 19 | Gravações seguidas de receitas podiam desfazer uma à outra; o limite de 100 aparecia como erro técnico; excluir uma receita da pessoa não pedia confirmação. | As gravações vão em fila, sobre a última gravada. O limite é dito em português, e excluir uma receita da pessoa pede um segundo clique. | unitário (limite) |
| 20 | Com uma ou duas cores de texto, seta, destaque e clique saíam na cor do balão. | O destaque só vem da paleta quando ela tem três cores ou mais. | unitário |
| 21 | Um Cancelar que chegava antes do registro da tarefa (lendo a aula, as transcrições ou o motor) se perdia, e a transcrição ou a mixagem rodava inteira. | A tarefa registra o sinal na primeira linha. O sinal chega a toda execução do FFmpeg, e é conferido entre as etapas. | jornada nativa |
| 22 | Mensagens do FFmpeg (em inglês, com caminhos), JSON inválido e arquivo sumido chegavam à pessoa. | Mensagens em português dizendo o que não deu para fazer; a voz da aula que mudou de lugar é dita pelo nome. | leitura |
| 23 | Um `pipelines.json` com uma receita de uma versão mais nova era lido como vazio, e a próxima gravação apagava todas as receitas da pessoa. | Leitura receita a receita, e uma cópia `pipelines.json.bak` antes de gravar o que foi lido. | unitário |
| 24 | Caminhos de dentro de uma aula iam ao FFmpeg sem restrição: uma URL ou uma pasta de rede faria a máquina sair para a rede. | O FFmpeg só aceita arquivo local (`-protocol_whitelist file,pipe`), e caminhos da aula que não sejam locais são ignorados. | `test:media-native` |
| 25 | Um quadro pedido depois da última imagem do vídeo (som mais longo que a imagem) parava o rascunho com ENOENT. | O quadro que não sai é pulado. | leitura |
| 26 | A camada transparente descompactava o ZIP inteiro de forma síncrona no processo principal, sem limite do tamanho descompactado e sem validar o FPS. A cópia final podia deixar meio arquivo sobre um existente. | Descompactação assíncrona, só do manifesto e dos quadros, até 1 GB; FPS validado; cópia ao lado e troca no fim. | jornada nativa |
| 27 | Procurar uma transcrição criava a pasta de cache do EdiAula mesmo sem o EdiAula instalado. | A pasta só é criada quando uma transcrição grava nela. | leitura |

Ficou como limite: o EdiSVG e o EdiAula gravando `whisper/settings.json` ao mesmo tempo podem
perder a escolha de modelo de um deles (muito improvável).

Verificações da segunda rodada:
- EdiSVG: 326 testes unitários e 144 e2e, rodados sobre o build novo (o e2e lê `out/renderer`,
  então `pnpm build` vem antes);
- `test:media-native`: 6, com o FFmpeg da suíte;
- verificação nativa com `EDISVG_PIPELINE_WHISPER=1`: as três jornadas dos pipelines e todas as
  anteriores, com transcrição real a partir de um cache limpo;
- typecheck e Biome sem erros.

O `@informach/edi-speech` e o EdiAula não mudaram nesta rodada.

## Limites que ficam

- A exportação da camada transparente não pode ser cancelada no meio da codificação: o diálogo de salvar aparece no fim.
- A narração e o vídeo de referência valem enquanto o arquivo está aberto. Reabrir o projeto não os traz de volta; rodar o pipeline de novo, sim.
- O rascunho pelo assistente depende do Claude Code ou do Codex na conta da pessoa. O ambiente de teste não os tem de propósito, então essa etapa é verificada só até a chamada (ela para dizendo por quê). A qualidade do rascunho precisa ser conferida com a conta do titular.
- Vídeos de outros programas não têm cursor: as setas dependem dos quadros que o assistente vê.

## Verificações

| Verificação | Resultado |
| --- | --- |
| EdiSVG, testes unitários | 322 aprovados |
| EdiSVG, e2e completo (`pnpm test:e2e`) | 144 aprovados |
| EdiSVG, `test:media-native` com o FFmpeg da suíte | 6 aprovados (corte, mixagem, transcrição existente, cursor, prévia e quadros, camada com alfa) |
| Verificação nativa do EdiSVG (`pnpm edi:test:native edisvg`, com `EDISVG_PIPELINE_WHISPER=1`) | aprovada: Cena com aula do EdiAula, Cena com áudio transcrito pelo Whisper, demonstração com a camada transparente exportada (VP9, `alpha_mode` 1) e todas as jornadas anteriores |
| EdiAula, suíte completa | 1.126 testes, 1.111 aprovados, 15 físicos pulados |
| `@informach/edi-speech` | 4 aprovados (trecho do roteiro na aula inteira) |
| Typecheck, Biome e sintaxe do EdiSVG | sem erros |
