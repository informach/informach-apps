---
provider: manual
pr:
round: 12
created_at: 2026-09-13T21:39:41Z
---

## Summary

- Total: 6
- Resolved: 6
- Unresolved: 0

## Escopo e parecer

Review técnico independente, somente leitura de código, da Fase Comercial 05 descrita em `docs/propostas/missao-saber-2026-09-13/fases-comerciais/fase-05.md`. Foram lidos os contratos vigentes, as dependências e as rodadas anteriores; os problemas de cobrança já rastreados em reviews-011 não foram repetidos aqui.

**Clean após correções.** Os seis achados foram resolvidos e verificados em testes unitários, integração PostgreSQL e E2E. Contagem atual: 0 pendências.

Arquivos gerados: `issue_001.md`, `issue_002.md`, `issue_003.md`, `issue_004.md`, `issue_005.md`, `issue_006.md`.

## Mapa da implementação

- `Player/ItemReport` → server action com Zod e usuário verificado → `saveReport`, com lock da conta, propriedade da sessão, identidade do item no snapshot, limite de 10 por 24 horas e índice único de request.
- Console `/manutencao` → identidade verificada na allowlist → fila de relatos, atualizações de suporte, decisões de conteúdo e agregações internas. Mutações também exigem confirmação recente e autorização do mantenedor.
- `setContentAvailability` → decisão com hash de conteúdo e hashes dos itens → lock de conteúdo compartilhado com início/resposta de sessão; `history` retira evidências invalidadas por hash do item e oculta resultados de avaliações incompletas.
- `/familia` → sessão recente + projeções por perfil proprietário → autonomia/revisão, uso semanal, reflexões e relatos. Dados detalhados continuam no servidor/banco do app.
- `productMetrics` → fatos de família/perfil/sessão, auditoria de checkout e customer/subscription isolados por app; exclusão por e-mail normalizado e somente resultado agregado.
- Migration 0048 → contexto/categoria/request/status dos relatos, histórico de atualizações, timestamp familiar, backfills, índices e FKs. Aplicada pela suíte em PostgreSQL descartável; não foram alterados dados reais.

## Aspectos bem implementados

A autorização de relatos vem da sessão proprietária, sem confiar em profileId/versão enviados pelo navegador. Replay da mesma request e conflito de payload são tratados sob lock, e o limite de abuso permanece. Atualização de suporte e histórico são atômicos. A invalidação existente preserva snapshots/tentativas e associa corretamente os itens mistos, em vez de criar novos acertos. Avaliações incompletas ficam fora da evidência familiar. O painel retorna agregados, protege o acesso pela allowlist verificada e explica o limite de interpretação de amostras pequenas. A configuração de Sentry desabilita replay/tracing e o scrubber remove corpos, identidades, contexto e parâmetros SQL dos eventos testados.

## Evidência de verificação

VERIFICATION REPORT
-------------------
Claim: Suíte de integração existente passa, incluindo migration 0048 e os três testes de observação familiar.
Command: `pnpm --filter @informach/missao-saber test:integration`
Executed: 2026-09-13 18:37 America/Sao_Paulo, nesta revisão.
Exit code: 0
Output summary: `Test Files 6 passed (6)`; `Tests 40 passed (40)`; banco `missao_review_b52ec6eb54de4365903b48e89c0f2363` criado e removido pelo runner.
Warnings: Notices de migrations já existentes; logs esperados dos cenários de falha de dunning.
Errors: Nenhuma falha de teste.
Verdict: PASS

VERIFICATION REPORT
-------------------
Claim: Testes existentes de engine e telemetria passam.
Command: `pnpm --filter @informach/missao-saber exec vitest run src/features/learning/engine.test.ts src/lib/telemetry.test.ts`
Executed: 2026-09-13 18:37 America/Sao_Paulo, nesta revisão.
Exit code: 0
Output summary: `Test Files 2 passed (2)`; `Tests 44 passed (44)`.
Warnings: Nenhum.
Errors: Nenhum.
Verdict: PASS

VERIFICATION REPORT
-------------------
Claim: Formatação/lint do escopo focado.
Command: `pnpm exec biome check apps/missao-saber/src/features/product-metrics apps/missao-saber/src/features/content-maintenance apps/missao-saber/src/features/learning apps/missao-saber/test/family-observation.integration.ts apps/missao-saber/src/lib/telemetry.ts apps/missao-saber/src/lib/telemetry.test.ts 'apps/missao-saber/src/app/(app)/familia/page.tsx' 'apps/missao-saber/src/app/(app)/manutencao/page.tsx'`
Executed: Nesta revisão, antes dos testes.
Exit code: 1
Output summary: `Checked 20 files`; `Found 10 errors`; `Found 2 warnings`.
Warnings: Duas non-null assertions nos fixtures de auditoria.
Errors: Formatação/organização de imports detectada pelo Biome; sem aplicação de fixes.
Verdict: FAIL

Problemas de estilo não viraram issues, conforme a skill. A revisão não executou build, homologação de provedor ou E2E completos. A jornada Playwright foi lida: cobre envio do relato, mas não o ciclo administrativo de correção versionada. Os três testes novos de F5 cobrem repositories e um happy path de métricas, não reload, fronteiras da coorte, versão histórica após atualização nem consulta de relatos tratados. Essa é uma delimitação de evidência; as seis issues descrevem defeitos de código, não supostas falhas deduzidas apenas da falta de testes.

Após triagem, a rodada pode ser processada com `compozy fix-reviews --name missao-saber`.
