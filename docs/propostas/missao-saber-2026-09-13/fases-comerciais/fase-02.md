# Fase 02: Motor e experiência dos novos formatos didáticos

[Voltar ao plano completo](../PLANO-VERSAO-COMERCIAL.md)

**Estado:** concluída e revisada.  
**Complexidade:** Alta.  
**Dependências:** Fase 01 concluída. Contrato de componentes e interação alinhado com a sessão de design; o trabalho de domínio e dados pode avançar antes do acabamento visual.

## Objetivo

Preparar o modelo de conteúdo, a correção e a interface para produzir a biblioteca comercial no formato definitivo. Esta fase antecede a autoria em escala para evitar criar centenas de atividades presas ao modelo atual de alternativas.

## Tarefas de implementação

### F2.1: Versionar o contrato de atividade

- [x] Implementado e verificado.

Introduzir tipos explícitos para alternativas, resposta numérica, ordenação e justificativa curta, com validação por tipo e serialização de respostas. Ler snapshots antigos sem alterar sua interpretação. Separar dados públicos de gabarito, critérios de correção, rubrica e pistas.

### F2.2: Implementar correção numérica

- [x] Implementado e verificado.

Aceitar inteiros, decimais com vírgula/ponto e frações quando o item permitir; tratar equivalências e unidades explicitamente. Usar cálculo determinístico e regras por atividade para tolerância/arredondamento. Rejeitar expressão arbitrária, infinito, NaN e entrada ambígua; não usar eval.

### F2.3: Implementar ordenação acessível

- [x] Implementado e verificado.

Validar cada passo uma única vez e aplicar ordem exata ou restrições de precedência declaradas. Aceitar todas as ordens que satisfaçam a regra do problema. Oferecer toque/clique e teclado, sem depender de arrastar, utilizando a apresentação entregue pelo design.

### F2.4: Implementar justificativa formativa

- [x] Implementado e verificado.

Guardar a explicação do estudante e apresentar solução comentada/rubrica no momento adequado. Classificar o resultado como reflexão registrada, sem transformá-lo automaticamente em acerto, erro ou domínio. A continuidade da trilha não depende de correção docente nem de aprovação manual.

### F2.5: Integrar exploração à missão

- [x] Implementado e verificado.

Permitir previsão, manipulação de barras/malha/grupos e aplicação independente com parâmetros do problema. Evoluir os laboratórios existentes. Estado matemático e texto alternativo pertencem ao contrato funcional; composição visual usa os componentes do outro trabalho.

### F2.6: Adaptar progresso, histórico e avaliações

- [x] Implementado e verificado.

Representar resultado objetivo, ajuda, pulo, reflexão e eventual invalidação separadamente. Tirar reflexões sem correção objetiva do denominador de acertos. Preservar idempotência, isolamento, pausa/retomada, exportação e correção somente ao final de avaliações. Não gravar uma justificativa como true/false apenas para caber no schema antigo.

### F2.7: Criar uma amostra vertical

- [x] Implementado e verificado.

Entregar exemplos autorais de cada novo tipo atravessando autoria, início, resposta, persistência, feedback, retomada e relatório. Marcar esses exemplos como ensino, nunca como itens reservados de avaliação. Usar a amostra para estabilizar o contrato que a fase 3 consumirá.

## Áreas existentes a modificar

Os caminhos abaixo são pontos de partida da inspeção atual. A implementação deve confirmar o estado dos arquivos e preservar alterações da sessão de design.

| Arquivo | Motivo |
| --- | --- |
| [apps/missao-saber/src/features/content/types.ts](<../../../../apps/missao-saber/src/features/content/types.ts>) | schema atual de alternativas e projeção pública |
| [apps/missao-saber/src/features/content/authoring.ts](<../../../../apps/missao-saber/src/features/content/authoring.ts>) | formato de autoria |
| [apps/missao-saber/src/features/learning/engine.ts](<../../../../apps/missao-saber/src/features/learning/engine.ts>) | correção e evidências |
| [apps/missao-saber/src/features/learning/schemas.ts](<../../../../apps/missao-saber/src/features/learning/schemas.ts>) | entradas das actions |
| [apps/missao-saber/src/features/learning/repository.ts](<../../../../apps/missao-saber/src/features/learning/repository.ts>) | respostas, snapshots e exportação |
| [apps/missao-saber/src/features/learning/components/player.tsx](<../../../../apps/missao-saber/src/features/learning/components/player.tsx>) | integração funcional dos tipos de atividade |
| [apps/missao-saber/src/features/labs/math.ts](<../../../../apps/missao-saber/src/features/labs/math.ts>) | regras matemáticas dos laboratórios |
| [packages/db/src/schema/missao-saber.ts](<../../../../packages/db/src/schema/missao-saber.ts>) | resultado formativo e compatibilidade de tentativas |

Novos módulos e artefatos previstos, sujeitos à organização final da implementação:

- Módulos de correção por tipo em features/learning.
- Componentes funcionais de resposta por tipo, integrados ao sistema visual existente.
- Migration aditiva gerada e adaptadores de leitura de snapshots anteriores, se necessários.

## Integração com a sessão de design

A sessão funcional define propriedades, estados, teclado, validação e eventos. A sessão de design define estilo, tokens, estados visuais, composição e assets. Novos componentes serão montados com esse contrato, sem reconstruir o design system.

## Validação necessária

- [x] 1/2 e 0,5 são equivalentes quando permitidos; unidade errada e valor fora da tolerância são rejeitados.
- [x] Ordenação respeita precedências e aceita alternativas válidas; passos repetidos, faltantes ou externos não passam.
- [x] Justificativa pode ser enviada e retomada sem fabricar acerto ou autonomia.
- [x] Duplo envio não duplica resposta, reflexão ou progresso; propriedade da sessão continua isolada.
- [x] Snapshot legado continua legível e mantém o gabarito original.
- [x] Gabaritos, soluções, resultado e rubrica de avaliação não vazam antes da conclusão.
- [x] Cada formato foi concluído por teclado e em celular; erros têm mensagem vinculada ao fluxo.

Executar os testes pertinentes sobre a versão que contém a fase e registrar seus resultados. Usar banco descartável para cenários de integração; não modificar dados reais para simular estados de teste. A verificação com provedores da fase 04 e a publicação da fase 06 seguem as condições específicas do plano mestre.

## Review da fase

Revisar a implementação depois dos testes, incluindo caminhos de erro, autorização, concorrência, preservação de dados e consequências didáticas. Conferir também os estados de interface alterados em conjunto com os componentes de design.

Registrar cada achado, sua correção e a verificação correspondente. Não encerrar a fase com defeitos do escopo transferidos silenciosamente para a próxima. Esse review é parte da execução e não exige aprovação editorial da responsável.

O relatório será criado em `evidencias/fase-02.md`, com versão/diff, tarefas entregues, comandos/resultados, achados/correções e limitações. Não registrar revisão automática como revisão humana realizada por Helena.

## Critérios de conclusão

- [x] Quatro formatos disponíveis no mesmo fluxo, com alternativas existentes preservadas.
- [x] Novos resultados integrados a histórico, relatórios e exportação.
- [x] Exemplos de todos os tipos aprovados em unidade, integração e navegador.
- [x] Contrato de autoria estabilizado e review F2 sem achados pendentes.

## Entregáveis

- Schemas e motor de correção versionados.
- Renderizadores funcionais integrados ao design.
- Amostra autoral por formato.
- Evidências e review F2.

Concluídos os critérios e o review, avançar para a [fase 03](fase-03.md).
