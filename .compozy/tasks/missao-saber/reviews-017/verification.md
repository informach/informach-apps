# VERIFICATION REPORT

```text
VERIFICATION REPORT
-------------------
Claim: alterações do Missão Saber verificadas localmente para commit e publicação
Command: comandos completos da tabela abaixo
Executed: 2026-10-02, nesta rodada, após as correções correspondentes
Exit code: 0 em todos os comandos finais
Output summary: 1.472 testes unitários + 84 de integração + 24 E2E; build de produção aprovado; cinco auditorias aprovadas; 3.308 itens revisados e zero pendentes; tipos aprovados em 12 pacotes; Biome do escopo sem erros ou avisos
Warnings: 18 avisos preexistentes do Biome fora do código alterado; avisos NO_COLOR/FORCE_COLOR do executor e NOTICE de migrations já existentes nos bancos descartáveis
Errors: none
Verdict: PASS
```

| Comando | Saída observada |
| --- | --- |
| `pnpm -r --if-present test` | 1.472 testes em 142 arquivos: Missão Saber 223; e-mails 112; auth 218; billing 199; AI core 71; Agenda 563; Cozya 86. Todos `Done`; exit 0. |
| `pnpm -r --if-present typecheck` | `Scope: 12 of 13 workspace projects`; todos os 12 comandos `tsc --noEmit` terminaram com `Done`, exit 0. |
| `pnpm --filter @informach/missao-saber test:integration` | `Test Files 23 passed (23)`; `Tests 84 passed (84)`; 99,99 s; migração aplicada e banco descartável removido. |
| `pnpm --filter @informach/missao-saber e2e` | `Compiled successfully in 11.5s`; `Finished TypeScript in 12.0s`; `24 passed (2.5m)`; banco descartável removido. Chromium desktop e celular. |
| `pnpm --filter @informach/missao-saber exec vitest run --config vitest.tools.config.ts tools/full-review-responses.tool.ts tools/advanced-content-audit.tool.ts tools/review-digests.tool.ts tools/recovery-review.tool.ts tools/weekly-cron.tool.ts` | `5 passed (5)`; `PENDENTES=0 REVISADOS=3308 ORFAOS=0`; `RESERVED_DUPLICATES 0`; `rejectedPrintedAnswers: []` para 1.206 itens numéricos. |
| `pnpm exec biome check apps/missao-saber/src apps/missao-saber/e2e apps/missao-saber/test apps/missao-saber/tools apps/missao-saber/scripts/verify-production-schema.mjs packages/db/src/index.ts packages/db/src/schema/missao-saber.ts packages/emails/src/dispatch.ts packages/emails/src/__tests__/dispatch.test.ts` | `Checked 268 files`; nenhum erro ou aviso. |
| `biome check .` na exportação limpa do índice Git | `Checked 1304 files`; zero erros; 18 avisos preexistentes de outros arquivos. Mesma configuração e versão do Biome do workspace. |
| `docker build -f infrastructure/railway/missao-weekly-cron.Dockerfile -t missao-weekly-review17 .` | Imagem produzida com sucesso; contexto de apenas 2,44 kB. |
| `docker run --rm missao-weekly-review17 sh -n /app/weekly-report-cron.sh` | Exit 0. Hash SHA-256 do script empacotado: `cf6a84201ad4b1d7cb21767403cdf9f0d6a2886214122b8ac65114512137e3db`, igual ao arquivo do checkout. |
| `git diff --cached --check` | Sem saída, exit 0. |

A política de Controle de Aplicativo do Windows impede executar `turbo.exe` nesta máquina. As suítes e tipos foram executados diretamente via PNPM em todos os pacotes; o CI Linux executará os comandos Turbo originais. O checkout usa `core.autocrlf=true`, e o Biome local também alcança arquivos temporários ignorados pelo Git. A verificação geral foi feita sobre `git -c core.autocrlf=false checkout-index --all`, em diretório separado, reproduzindo os bytes que serão publicados. Não foi desativada regra de lint nem proteção do Windows.

A primeira rodada E2E reproduziu o erro do caderno e revelou o compartilhamento indevido do IP nos testes. A rodada seguinte verificou os gráficos em tema escuro e encontrou um seletor ambíguo entre o alerta do caderno e o anunciador de navegação do Next. O seletor agora se limita ao conteúdo principal. A rodada final aprovou os 24 cenários, sem testes pulados.

Logs ignorados pelo Git em `.cache/`: `missao-review17-tests-direct.log`, `missao-review17-types-direct.log`, `missao-review17-integration.log`, `missao-review17-e2e-final.log`, `missao-review17-audits-final.log`, `missao-review17-scoped-lint.log`, `missao-review17-lint-final.log` e `missao-review17-cron-image.log`. As capturas de gráficos e planificações ficam em `apps/missao-saber/tmp/improvements/`.

Este relatório registra a verificação anterior ao commit. Deploy, CI remoto, schema de produção e smoke test serão conferidos contra o SHA publicado e registrados na evidência operacional local e na resposta final.
