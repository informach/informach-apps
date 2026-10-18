# Lote 03 — biblioteca, portabilidade e entrada/saída

Data: 18/10/2026. Escopo: M05, N16, N17 e N19 do brief `.superpowers/sdd/2026-10-18-edicaptura-snagit/task-3-brief.md`. Sem commit, publicação ou alteração de serviços. Preservar os lotes 01/02.

## Contratos e arquivos

- `src/domain/document.ts`: metadados opcionais retrocompatíveis (tags, favorito, coleção, app de origem, lixeira e estado de extração de vídeo); atualização estrita independente das mídias.
- `src/domain/library-index.ts`: índice incremental em memória, busca por trigramas, filtros e paginação até 60 registros. Uma leitura inicial dos metadados; salvar não relê a coleção nem hidrata assets. Ordem estável por data e UUID.
- `src/main/library.cjs`: integra índice, lixeira reversível, duplicação completa e transações serializadas. Documento JSON é o ponto de publicação; mídias ficam preservadas.
- `src/main/portable.ts`: ZIP versionado com manifesto SHA-256; valida nomes, contagem, tamanhos e atributos antes de descompactar. Projeto editável e backup integral, incluindo itens danificados. Importação colidente produz UUID determinístico sem sobrescrever original; restore integral exige pasta vazia. Troca de raiz copia/verifica antes de mudar a preferência e mantém a raiz anterior.
- `src/main/library-ipc.ts`, main/preload: operações limitadas ao editor; diálogos escolhem caminhos, bytes do drop validados no main. Preferências locais de bandeja/início do Windows desligadas por padrão. Área de transferência e arquivos integram navegador/Office.
- `src/editor/library.js`, editor/CSS: biblioteca paginada, filtros, seleção, ações em lote, destinos favoritos, projeto portátil, backup/restauração e preferências com mensagens de cancelamento/falha.
- Testes isolados de índice, ZIP, colisão, lixeira, cópia, falhas e renderer; benchmarks de busca/lista com 1.000 e 10.000 registros.

## Sequência e aceitação

1. Ampliar schema e índice com testes de busca/filtros/paginação. Metadados não regravam mídia; salvar modifica só um registro do índice.
2. Implementar transações de biblioteca, duplicação com assets e ZIP validado. Arquivos corrompidos continuam no backup; falhas não apagam fonte; traversal/symlink/ZIP excessivo são recusados antes de extração.
3. Conectar IPC e UI utilizável. Cancelamento não modifica biblioteca; importação assíncrona não troca um documento aberto posteriormente; grade limitada a 60 cards.
4. Verificar testes Node, TypeScript, renderer, build e Biome focado; registrar comandos, números e limitações no relatório. O pai atualiza o estado/tracking compartilhado e faz revisão independente.

## Compatibilidade investigada

A documentação oficial TechSmith descreve SNAGX como projeto que preserva objetos vetoriais, mas as páginas consultadas não publicam schema de interoperabilidade. Não há parser SNAGX neste lote: exportar PNG/JPEG/WebP pelo Snagit importa a imagem final sem objetos editáveis; o arquivo SNAGX original fica com o usuário. A orientação oficial de migração é Batch Convert Images: [exportar biblioteca](https://support.techsmith.com/hc/en-us/articles/27142747345805-How-Do-I-Export-My-Snagit-Library-if-I-No-Longer-Plan-to-Use-Snagit), [objetos e formato de projeto](https://support.techsmith.com/hc/en-us/articles/115002473092-Create-Source-Graphics-for-Future-Editing-in-Snagit-Editor).

Vídeos importados permanecem WebM, sem transcodificação. `media.status = pending` e campos de duração, dimensões e thumbnail formam o contrato de extração do lote 05. Nenhum valor de duração é inventado. PNG/JPEG/WebP são normalizados em PNG após validação no processo main.

## Entrega e evidências — 18/10/2026

Implementação entregue para revisão independente com ressalvas (`DONE_WITH_CONCERNS`). Os fluxos descritos acima estão ligados à UI. O índice usa páginas de até 60 itens e recentes de até oito; lixeira, tags, favoritos e coleção alteram só metadados. Projetos duplicados incluem originais e sidecars. Backup integral conserva também metadados danificados e arquivos portáteis de recuperação. Importações idênticas reutilizam o projeto; colisões de conteúdo recebem UUID determinístico. A cópia da raiz usa streaming e SHA-256 por arquivo, mantém a origem e reverte a raiz ativa se a preferência não puder ser gravada.

O arquivo portátil usa manifesto v1 e SHA-256, com 800 MB de conteúdo/20.000 arquivos/10 MB de manifesto. Headers locais e centrais são conferidos antes de descompactar; a saída real de cada entrada deflate é limitada por `inflateRawSync({ maxOutputLength })`, impedindo alocação maior que o limite declarado. Referência: [Node zlib](https://nodejs.org/api/zlib.html#class-options). O backup usa memória; não há promessa de operação streaming para arquivos portáteis. A transferência da raiz não usa esse orçamento de arquivo portátil.

O Electron 44.8.0 não decodifica WebP por NativeImage neste ambiente. O lote acrescenta `raster-codec.mts`: decoder Chromium local, oculto, sandbox, contextIsolation, sem preload/Node/autoridade IPC ou conteúdo remoto, com preflight de dimensões e destruição no sucesso/falha. Ele atende importação e validação da exportação WebP. `test:media-native` verifica importação persistida, rejeição de bytes inválidos, limpeza, colisões de exportação e nomes reservados do Windows. A CI Windows executa esse script.

Durante a integração também foi corrigido A04: criação e duplicação de passos compartilham alocador de números únicos; ao alcançar 1.000, usam números livres. O limite de 1.000 objetos é respeitado e desfazer/refazer preservam o resultado. A geometria do editor não foi alterada por essa correção.

- Node: **66 testes, 66 pass, 0 fail/skip**; TypeScript e build passaram.
- Chromium: quatro runners passaram, incluindo 130 projetos em filesystem isolado, paginação, favoritos/lixeira/restauração persistidos, pixels de ocultação na saída em lote, cancelamento e importação tardia.
- Biome focado: exit 0, sem erros; mantém seis avisos de especificidade CSS e 14 informações de template literals no código herdado. Não foram introduzidas supressões.
- Benchmark sintético do índice, médias de 30 consultas: 1.000 itens — build 56,9 ms, lista 3,096 ms, busca 0,075 ms, filtro 0,832 ms; 10.000 — build 480,9 ms, lista 44,772 ms, busca 0,076 ms, filtro 3,383 ms. Lista limitada a 60; não mede disco, thumbnail/RSS nem abertura fria.
- Gate nativo licenciado: duas execuções anteriores passaram. Uma execução posterior encerrou com exit externo 1 e código interno informado `3221226505`, após `Native verification: edicaptura`, antes da nova screenshot restrita. Essa mensagem precede build interno e `_electron.launch`; a causa não foi identificada. Uma execução diagnóstica com fatal reports do Node e exclusão de ambiente passou com o código final, sem alterar sandbox/gates e sem gerar fatal report. Esse passe não apaga a falha anterior nem comprova sua causa.

Os detalhes dos comandos, arquivos e ressalvas estão no relatório de execução `.superpowers/sdd/2026-10-18-edicaptura-snagit/task-3-report.md`. A revisão independente e os lotes seguintes continuam com o agente principal. Não houve commit, push, deploy, publicação ou alteração de cobrança.

## Correções da review 003 — rodada 1

Os quatro achados foram implementados para re-review: atalhos de canvas limitados ao editor ativo; geração de workspace que invalida leituras/preparações/ativações antigas e drena gravações antes de trocar a raiz; ação distinta **Copiar arquivo exportado**, com identidade/tamanho/SHA-256 do último arquivo validado e FileDrop nativo do Windows; texto de vídeo descrevendo apenas WebM e as limitações atuais. A cópia de arquivo usa helper local fixo, entradas JSON por stdin UTF-8, sem comandos montados a partir de paths, renderer privilegiado ou relaxamento de sandbox.

Regressões finais: 67 testes Node; cinco runners Chromium; TypeScript/build/Biome focado passaram. O teste de workspace cobre root open/restore reais com UUIDs coincidentes e leitura/decode atrasados, abertura na raiz nova antes de liberar decode antigo, além de cópia de raiz aguardando save em voo. A regressão falha no editor congelado da revisão por autosave indevido na biblioteca e passa no código corrigido.

O teste nativo constrói FileDrop com Windows Forms/DataObject e lê CF_HDROP real via COM/HGLOBAL e shell32 para `Saída final [imagem].png` e `Vídeo $(no-command) [final].webm`. A criação de estação privada retornou acesso negado (5) antes de acessar qualquer clipboard. O harness registra essa ressalva e não faz fallback para o clipboard do usuário. Portanto, a construção/leitura do formato foi verificada; a publicação completa no clipboard Windows permanece sem verificação neste ambiente. O histórico anterior de falha nativa não identificada também permanece. Re-review independente pendente; nenhum achado canônico foi marcado como resolvido pelo implementador.

## Correção remanescente 002 — rodada 2

A segunda passagem da revisão confirmou uma lacuna na transição: fechar as preferências ainda permitia editar o documento enquanto o salvamento dessas edições era suspenso. A correção bloqueia Fechar/Escape/submit e todos os controles/superfícies do editor antes de gravar e abrir o seletor nativo. O status mostra a troca em andamento. O cancelamento de interação do canvas invalida callbacks antigos de texto/raster e desfaz apenas o gesto incompleto; imagens/estilos/cópias em andamento também verificam o workspace. Ao cancelar ou falhar, o documento e a edição retornam; no sucesso, o documento antigo é limpo. Filas/checagens de geração da rodada 1 permanecem.

Regressão no renderer real com bibliotecas isoladas: nove combinações (abrir/copiar/restaurar × sucesso/cancelamento/falha), cada uma aguardando tanto seletor nativo quanto resposta. Fechar, Escape, Enter, nome, propriedades, ponteiro e atalhos são tentados durante o bloqueio; callbacks anteriores de paste/import/raster/texto novo e edição de texto são liberados tarde e não alteram o documento. Edições anteriores são verificadas no filesystem, e novas edições funcionam após cancelamento/falha. A nova regressão falha no snapshot da rodada 1 porque Fechar encerra o diálogo durante a transição e passa no código corrigido. Gates finais: 67 Node, cinco runners Chromium, typecheck, build e Biome focado passaram. Nenhum gate nativo/clipboard foi repetido nesta rodada; as ressalvas anteriores permanecem. Achado 002 aguarda re-review independente.

O re-review da rodada 1 aprovou os achados 001, 003 e 004. O 002 permanece alto: fechar preferências durante a troca de raiz ainda permitia editar o documento com salvamento bloqueado; a resposta bem-sucedida descartava a edição. A rodada 2 trata a atomicidade das alterações e do diálogo durante a transição, com regressão de sucesso, cancelamento e falha. O lote ainda não está aprovado.

## Gate final do lote — 18/10/2026

O re-review da rodada 2 aprovou especificação e qualidade/segurança no escopo: **4 achados resolvidos, 0 pendentes**, sem novo bloqueador confirmado. O bloqueio começa antes do primeiro save/seletor de pasta, impede fechamento do diálogo e alterações no editor, invalida callbacks antigos de texto/imagem/colar e drena gravações anteriores. Cancelamento/falha restauram os controles e preservam alterações aceitas antes da transição; o status permanece coerente com gravação e erro.

Evidência final atribuída ao implementador: **67/67 Node**, cinco runners Chromium, TypeScript, build e Biome focado passaram. A regressão real de filesystem/renderer cobre abrir/copiar/restaurar × sucesso/cancelamento/falha nos limites de seletor e resposta; ela falha na versão da rodada 1 ao conseguir fechar o diálogo e passa na corrigida. O revisor examinou o diff e essa evidência sem repetir gates inalterados. Registro canônico: `.compozy/tasks/edicaptura-snagit/reviews-003/`.

Isso encerra o lote 3, preservando as ressalvas: duração/miniatura de vídeo continuam no lote 5; SNAGX não tem parser editável; a publicação integral do clipboard e a causa da falha nativa anterior permanecem sem verificação. Ainda não há homologação física completa, publicação ou paridade integral declarada.
