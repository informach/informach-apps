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
