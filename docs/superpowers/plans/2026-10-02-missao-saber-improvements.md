# Missão Saber — implementação das melhorias da revisão 016

**Goal:** entregar as seis melhorias propostas em reviews-016, preservando as correções já verificadas e os históricos familiares.

**Architecture:** separar progressão/calendário, conteúdo de recuperação, figuras didáticas, caderno e processamento semanal. O catálogo permanece versionado; mudanças no banco serão aditivas e geradas pelo Drizzle. Execução nesta sessão, com revisão e testes por entrega; sem commit ou publicação automática.

**Tech Stack:** TypeScript, React/Next, Zod, Drizzle/PostgreSQL, Vitest, Playwright.

**Spec:** `.compozy/tasks/missao-saber/reviews-016/README.md` e solicitação do usuário para corrigir todos os achados e implementar as propostas.

## Restrições comuns

- Preservar snapshots e tentativas; não converter repetição da mesma resposta em evidência nova.
- Unidades do rótulo continuam implícitas e frações continuam aceitas.
- Cada escrita verifica responsável/perfil; novos dados entram na exportação/exclusão existentes.
- Banco descartável e e-mails locais durante testes. Migrações de produção/publicação não fazem parte desta execução.
- Calendário de revisão: dia civil de `America/Sao_Paulo`, coerente com o dia mostrado na interface.
- Caderno: até 100 anotações ativas; arquivar preserva texto e libera espaço. Busca inclui o arquivo quando selecionado.

## 1. Conclusão e revisão por calendário

Arquivos: `features/learning/recommendation.ts`, `engine.ts`, `service.ts`, páginas Hoje/Jornada/Revisão e testes de learning.

- [x] Remover o retorno automático à primeira missão quando não há item novo nem revisão vencida.
- [x] Expor `courseProgress(lessons, attemptedItemIds)` com contagem e estado de conclusão do percurso inteiro, distinguindo falta de acesso de conclusão.
- [x] Mostrar conclusão, próxima data e links explícitos para repetir/aprofundar; manter missões acessíveis pela jornada.
- [x] Calcular datas com `reviewDateAfter(date, days)` e conferir manhã/noite do mesmo dia, virada do mês e janela de revisão.
- [x] Verificar 14 cursos concluídos: `expect(recommend(all, evidence, states, now, allIds)).toBeNull()` sem pendências. Revisão vencida continua retornando modo review.

## 2. Recuperação com novas questões

Arquivos novos: `features/content/recovery/`, conteúdo/oráculos de recuperação e testes. Integração em catálogo, disponibilidade, recomendação e inventário.

- [x] Criar questões de transferência autorais para as 58 habilidades, com três estratégias reais por habilidade e opções de prática em dias diferentes.
- [x] Manter o banco reservado de avaliação separado; não fabricar novidade apenas mudando IDs ou números da mesma questão já vista.
- [x] Selecionar recuperação não vista quando a prática regular da habilidade se esgotar; oferecer retomada explícita sem alegar domínio quando todo o conteúdo já foi visto.
- [x] Preservar contagem por família e primeira tentativa; evidências novas corretas sem pistas podem demonstrar recuperação em mais de um dia.
- [x] Revisar enunciados, pistas, respostas e premissas; registrar hashes somente após revisão e verificar ausência de sobreposição com os bancos reservados.

## 3. Gráficos e planificações acessíveis

Arquivos: `features/content/types.ts`, `skill-factory.ts`, `skills/funcoes.ts`, `skills/espaco.ts`, novo componente `item-figure.tsx`, player/histórico e testes.

- [x] Definir uma figura declarativa opcional no item: gráfico cartesiano com pontos/eixos e conjunto de planificações com células inteiras.
- [x] Renderizar SVG escalável com descrição e alternativa em tabela/texto; nenhum gabarito no DTO público.
- [x] Inserir gráficos nos oito itens de leitura gráfica e trocar memorização das 11 planificações por comparação de desenhos.
- [x] Conferir coordenadas, escalas, rótulos, contraste e dobradura dos desenhos com oráculos matemáticos.
- [x] Incrementar versões das missões afetadas e verificar snapshots antigos sem figura.

## 4. Caderno com contexto, busca e arquivo

Arquivos: schema `missaoNotes`, repositório de aprendizagem/caderno, actions/schemas, página Caderno, Notebook, player e testes de integração/E2E.

- [x] Adicionar `archivedAt`, `sessionId` e `itemId` opcionais; gerar migração aditiva.
- [x] Paginar por `(createdAt,id)` em lotes de 20, pesquisar texto com parâmetros e filtrar ativas/arquivadas.
- [x] Validar que sessão e questão vinculadas pertencem ao perfil; preservar contexto congelado.
- [x] Permitir editar, arquivar e restaurar; restauração respeita 100 ativas e toda mutação usa lock do responsável.
- [x] Usar link do player para abrir uma anotação com contexto opcional e informar espaço disponível/arquivo na interface.
- [x] Testar isolamento, contexto forjado, limite/arquivo, paginação com datas iguais, busca literal e preservação de rascunho.

## 5. Resumo semanal em lotes retomáveis

Arquivos: schema `missaoFamilies`, repositório de destinatários, `resumo-semanal.ts`, rota do job, runner do cron e testes de integração/carga.

- [x] Adicionar checkpoint por família (`weeklyReportProcessedWeek`), sem persistir o corpo sobre crianças.
- [x] Selecionar até 20 destinatários pendentes por cursor de userId; respeitar verificação e descadastro antes da seleção e entrega.
- [x] Registrar checkpoint após sucesso/ignorado; falhas permanecem pendentes. Retomar ignora famílias concluídas e mantém a deduplicação do dispatcher.
- [x] Responder com contagens, duração, cursor e término; o runner percorre todos os lotes mesmo se um deles tiver falhas e sinaliza falha ao final.
- [x] Testar reinício, falha parcial, limite do lote, descadastro durante execução e ausência de duplicação.
- [x] Medir consulta e execução com massa local representativa; documentar volume, duração e limites da medição.

## 6. Fechamento

- [x] Conferir todos os 13 achados e seis recorrências de reviews-016 contra o código atual.
- [x] Rodar testes unitários, integração isolada, E2E com build, TypeScript, Biome e auditorias do catálogo.
- [x] Verificar migração gerada e compatibilidade dos registros anteriores; atualizar inventário e documentação operacional.
- [x] Registrar evidência final e marcar cada proposta implementada no relatório, distinguindo testes locais de homologação externa.
