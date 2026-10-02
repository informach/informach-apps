# Missão Saber — implementação das oportunidades

Entrega de 02/10/2026, autorizada pelo pedido «Corrija todos os achados e implemente as melhorias propostas». As seis oportunidades da [revisão 016](README.md) receberam implementação. As correções das rodadas 015 e 016 continuam no código e na suíte de regressão. Alterações locais, sem commit ou publicação.

## O que mudou

| Proposta | Entrega e comportamento |
| --- | --- |
| Conclusão da trilha | Os 14 cursos deixam de reiniciar automaticamente a primeira missão quando o conteúdo se esgota. Hoje e Jornada mostram a conclusão do percurso principal, a próxima data de revisão e os caminhos para recuperar ou aprofundar. Percorrer missões não é apresentado como domínio. |
| Recuperação | 348 questões novas, organizadas em 116 encontros, cobrem as 58 habilidades. São três estratégias por habilidade, com um problema por estratégia em cada encontro. As famílias existentes são reutilizadas: mudar a questão não aumenta artificialmente a diversidade de estratégias. O segundo encontro abre no dia seguinte ao registro das três respostas do primeiro, com validação no servidor. |
| Representações visuais | Os oito itens de `funcoes-4` apresentam gráficos em SVG com escalas, legenda por tipo de linha e tabela de coordenadas. `espaco-2-6` compara três arranjos desenhados, em vez de cobrar o número de planificações do cubo. Há descrição textual e coordenadas das células. Gráficos também aparecem ao revisitar respostas. |
| Datas de revisão | A revisão vence no dia civil de São Paulo, sem um horário oculto. A mesma data é usada no motor, na recomendação e na exibição. A prática pela manhã do dia indicado avança o espaçamento. |
| Caderno | Vínculo opcional à missão/questão, texto do snapshot original, edição, pesquisa literal, paginação de 20 registros, arquivo e restauração. O limite é de 100 anotações ativas; arquivar preserva o texto e libera espaço. Restauração respeita o limite e todas as operações conferem propriedade. |
| Resumo semanal | Lotes de até 20 famílias, cursor e checkpoint semanal persistido por família. Falhas permanecem pendentes; reiniciar não repete as famílias concluídas. O cron segue os lotes mesmo após falha parcial, alerta ao final e mantém o descadastro e a deduplicação da entrega. |

O relatório familiar e os controles de recuperação mostram quantas estratégias e quantos dias já têm primeiros acertos sem pistas, além do que falta observar. Uma segunda tentativa correta na mesma questão continua sendo prática. Se todos os novos itens forem vistos com erros ou pistas, a recuperação não promete autonomia automaticamente: o banco é finito e a interface diferencia repetição de questão nova.

O acervo passa a **3.308 itens**, em **291 missões regulares, 116 encontros de recuperação e 28 bancos de avaliação**. São 1.752 questões de escolha, 1.206 numéricas, 175 de ordenação e 175 de justificativa. O percurso principal de cada curso e os bancos reservados foram preservados.

## Conferência do conteúdo

Os enunciados, dados, respostas, premissas e pistas dos 348 itens foram conferidos durante a autoria. As estratégias não foram geradas apenas renomeando IDs. Dois casos de combinatória que repetiam contas dos bancos reservados foram substituídos antes do fechamento. A auditoria final verifica ausência de sobreposição estrutural e numérica, alternativas únicas, pistas e formatos válidos; uma regressão exige que cada família da recuperação já exista na prática da habilidade.

Os testes matemáticos usam enumeração independente para combinações, divisores, múltiplos e resultados de dados; substituição para equações; relações geométricas para distâncias e triângulos; e equivalência de fluxos para os modelos financeiros. As coordenadas dos oito gráficos são conferidas por suas funções. Uma simulação de dobradura propaga orientações tridimensionais entre quadrados e confirma que somente o arranjo A fecha as seis faces distintas do cubo.

`funcoes-4` e `espaco-2` passaram da versão 1 para a 2. Os novos encontros começam na versão 1. Os hashes foram registrados após a conferência; o [manifesto por item](improvements-content.json) registra 348 inclusões e nove alterações. Snapshots anteriores continuam válidos, inclusive itens sem figura. Não houve reescrita de respostas históricas.

Durante essa validação também foi corrigida a exibição de resultados racionais: a devolutiva mostra uma fração exata, como `7/12`, quando arredondar mudaria a resposta. A auditoria agora exige que **toda solução numérica exibida seja aceita pelo corretor**. O problema original de `0,5`/`1 / 2`, com unidade implícita no campo, permanece exercitado no navegador.

## Carga e operação

Medição sintética local com **41 famílias, 41 perfis, 1.800 sessões e 10.800 tentativas**. Um perfil contém 6.000 tentativas; os outros, 120 cada. O PostgreSQL é descartável e o transporte de e-mail é em memória. Na execução final, os três lotes levaram **3.339 ms, 1.187 ms e 63 ms**. A falha simulada de uma família produziu HTTP 503; o processamento alcançou as outras 40 e a retomada enviou somente a pendente.

Esses tempos não estimam latência do provedor externo nem constituem capacidade certificada de produção. O histórico por perfil ainda é lido integralmente; a medição inclui esse custo. Os lotes limitam destinatários e verificam o orçamento de 45 segundos entre famílias. Uma família em processamento pode ultrapassar esse limite. O cron tem limite global de 1.200 segundos e mantém o progresso no banco entre execuções.

Para chamar o job manualmente, uma resposta bem formada fornece `semana`, `nextCursor`, `done`, contagens e duração. Enquanto houver cursor, a próxima chamada usa `?after=<cursor codificado>&week=<semana>`. O script já faz isso usando os headers `x-next-cursor` e `x-report-week`. HTTP 503 com esses headers permite continuar o lote e sinaliza falha pendente; sem headers válidos, a execução termina com alerta. Reiniciar sem cursor retoma as famílias pendentes. Mudança de semana durante a paginação retorna 409.

O próprio script de cron é testado contra um servidor HTTP local: recebe uma falha parcial, segue o cursor codificado, termina os lotes e emite um único alerta local. Nenhum e-mail ou alerta real foi enviado.

## Migração e publicação

A migração gerada pelo Drizzle é `0064_missao_notebook_weekly_batches.sql`: acrescenta `weekly_report_processed_week` às famílias e `archived_at`, `session_id`, `item_id` às anotações; cria a FK com `ON DELETE SET NULL` e o índice de paginação. São campos opcionais; anotações existentes continuam ativas e sem contexto. Não é necessário backfill. Arquivadas continuam incluídas na exportação e na exclusão do perfil.

A migração foi aplicada somente nos bancos locais descartáveis dos testes. Na publicação, o serviço migrador deve aplicá-la antes de liberar esta versão, seguindo o healthcheck de schema já existente. Um rollback de emergência do app pode manter os campos aditivos no banco, mas a interface antiga não distingue anotações arquivadas e o cron antigo não usa checkpoints; não remover colunas para reverter código.

## Compilação e fontes

Uma recompilação reproduziu uma falha do Turbopack ao processar URLs retornadas pelo Google Fonts. Nunito e Fredoka passaram a ser distribuídas no próprio projeto em WOFF2, usando a [integração oficial de fontes locais do Next.js](https://nextjs.org/docs/app/getting-started/fonts#local-fonts). Os arquivos completos preservam glifos, acentos e eixos variáveis; totalizam 187.448 bytes. Licenças, origem fixada por commit e hashes constam em `src/app/fonts/`. A compilação não precisa mais consultar o serviço de fontes.

## Verificação final

```text
VERIFICATION REPORT
-------------------
Claim: Achados das revisões 015/016 corrigidos e seis oportunidades implementadas e verificadas localmente.
Command: Comandos completos na tabela abaixo.
Executed: 02/10/2026, após a última alteração de código; rodada final de testes iniciada às 12h48, horário de São Paulo. Build/E2E executados com as fontes locais antes dessa rodada.
Exit code: 0 em todos os comandos finais listados.
Output summary: Tests 220 passed (220); Tests 84 passed (84); 22 passed (1.9m); Tests 112 passed (112); Tests 5 passed (5); Compiled successfully in 10.5s; Checked 266 files in 507ms. No fixes applied.; PENDENTES=0 REVISADOS=3308 ORFAOS=0.
Warnings: PostgreSQL informa extensões já existentes e truncamento de nome de constraint de migrações anteriores. Node informa NO_COLOR/FORCE_COLOR no runner E2E. Git informa normalização CRLF/LF em packages/emails/CLAUDE.md.
Errors: Nenhum na execução final. Os logs de falha de cobrança e esgotamento de tentativas de e-mail são esperados nos testes que simulam falha do transporte.
Verdict: PASS
```

| Comando | Evidência final |
| --- | --- |
| `pnpm --filter @informach/missao-saber test` | 220 testes em 18 arquivos; 10,79 s. |
| `pnpm --filter @informach/missao-saber test:integration` | 84 testes em 23 arquivos; 84,01 s. Migração aplicada e banco descartável removido. |
| `pnpm --filter @informach/missao-saber e2e` | Build de produção e 22 jornadas em Chromium desktop/celular; 1,9 min de testes. Banco descartável removido. |
| `pnpm --filter @informach/emails test` | 112 testes em oito arquivos; 5,67 s. |
| `pnpm --filter @informach/missao-saber typecheck` | `tsc --noEmit`, exit 0. |
| `pnpm --filter @informach/emails typecheck` | `tsc --noEmit`, exit 0. |
| `pnpm --filter @informach/db typecheck` | `tsc --noEmit`, exit 0. |
| `pnpm exec biome check apps/missao-saber/src apps/missao-saber/e2e apps/missao-saber/test apps/missao-saber/tools packages/db/src/index.ts packages/db/src/schema/missao-saber.ts packages/emails/src/dispatch.ts packages/emails/src/__tests__/dispatch.test.ts` | 266 arquivos; nenhum erro ou ajuste pendente. |
| `pnpm --filter @informach/missao-saber exec vitest run --config vitest.tools.config.ts tools/full-review-responses.tool.ts tools/advanced-content-audit.tool.ts tools/review-digests.tool.ts tools/recovery-review.tool.ts tools/weekly-cron.tool.ts` | Cinco auditorias aprovadas; 11,52 s. As 1.206 soluções numéricas exibidas são aceitas; zero duplicatas reservadas encontradas; ledger íntegro com 3.308 itens. Inclui execução real do script de cron contra HTTP local. |
| `& 'C:/Program Files/Git/bin/bash.exe' -n apps/missao-saber/scripts/weekly-report-cron.sh` | Sintaxe válida, exit 0. |
| `git diff --check` | Exit 0. |

As quatro suítes de produto somam **438 testes aprovados**, incluindo os existentes, além das cinco auditorias. As regressões cobrem novamente os 13 achados da rodada 016 e suas seis recorrências, e continuam exercitando as correções da rodada 015. Os requisitos do [plano de implementação](../../../../docs/superpowers/plans/2026-10-02-missao-saber-improvements.md) foram conferidos contra código, catálogo, migração e testes.

A primeira execução E2E das novas jornadas revelou uma espera ausente no próprio teste de recuperação: a URL era capturada antes da navegação terminar. Foi acrescentada a espera pelo endereço da sessão. A recompilação seguinte revelou a falha de fontes descrita acima, corrigida com os mesmos arquivos de fontes servidos localmente. A execução final aprovou todas as jornadas; nenhum teste foi removido ou desabilitado.

Logs locais na raiz: `tmp-improvements-verified-unit.log`, `tmp-improvements-verified-integration.log`, `tmp-improvements-verified-emails.log`, `tmp-improvements-verified-tools.log`, `tmp-improvements-verified-app-types.log`, `tmp-improvements-verified-email-types.log`, `tmp-improvements-verified-db-types.log`, `tmp-improvements-verified-lint.log` e `tmp-improvements-e2e-fonts.log`. Capturas das figuras ficam em `apps/missao-saber/tmp/improvements/`. São evidências temporárias; os testes e os oráculos permanecem no repositório.

## Limites

Sem deploy, migração de produção, transações Stripe, e-mails externos ou homologação externa de provedores. O navegador coberto é Chromium em desktop e emulação móvel; isso não substitui testes físicos Android/iOS, Safari ou uma avaliação formal com leitores de tela. A conferência matemática e estrutural não é uma certificação pedagógica externa. `.claude/settings.local.json` foi preservado.
