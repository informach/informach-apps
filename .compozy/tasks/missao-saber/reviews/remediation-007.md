# Missão Saber — correção dos cinco achados

Concluído em 13/09/2026, 15:51 UTC. A rodada [reviews-007](../reviews-007/_meta.md) está com **5 resolvidos e 0 pendentes**. O [parecer independente](remediation-007-independent.md) é favorável, sem novos achados. Esta é a situação atual; a [segunda revisão completa](full-review-2.md) preserva o diagnóstico anterior às correções.

## Correções e evidências

| Achado | Resultado | Evidência comportamental |
| --- | --- | --- |
| [001 — checkouts duplicados](../reviews-007/issue_001.md) | Intenção durável por cliente, recuperação de resposta perdida, retomada da sessão compatível e expiração antes de trocar plano. A proteção da conta permanece durante todo o ciclo pagável. | Integração verifica repetição após cinco minutos, planos diferentes, concorrência, resposta desconhecida, prazo absoluto, pagamento anterior ao webhook, FK após projeção, cancelamento, expiração e nova assinatura. Adapter Stripe percorre mais de 100 sessões e aborta quando conclusão vence a expiração. |
| [002 — jobs contra encerramento](../reviews-007/issue_002.md) | Reconciliação e lembretes usam o mesmo lock do checkout/webhook/encerramento, com releitura de elegibilidade e tombstones dentro do lock. | Resposta remota e entrega atrasadas impedem encerramento concorrente; após encerrar, assinatura continua cancelada, sem acesso pago ou lembrete novo. Candidato anterior ao encerramento é descartado. |
| [003 — categoria SendGrid](../reviews-007/issue_003.md) | Strings e arrays aceitos nos três apps. Argumento próprio `informach_category`; categoria/usuário da entrega persistida têm precedência. | Lote realmente assinado com array, bounce e descadastro retorna 200 e grava supressão/preferência sem duplicação. Categoria conflitante não substitui a entrega. Regressões de Cozya e Agenda aprovadas. |
| [004 — pausas antigas](../reviews-007/issue_004.md) | Consulta própria de pausa e diagnóstico; “Meu histórico” com paginação e links para retomar/reler. Cursor UUID mantém a precisão do banco. | 35 sessões completas com timestamps empatados em microssegundos mais uma pausa antiga: 36 resumos acessíveis, sem duplicação ou snapshot. Perfil alheio é recusado. Browser desktop/mobile retoma pausa depois de 31 conclusões novas, pela segunda página. |
| [005 — semana com oito dias](../reviews-007/issue_005.md) | Hoje e seis dias civis anteriores em São Paulo; todas as métricas usam a mesma seleção e excluem futuro. | Teste reproduziu oito dias antes da correção e passou com sete; cobre meia-noite local, instante final, mudança de mês e ausência de evidência. |

O review da remediação corrigiu ainda três detalhes das mesmas raízes: transferência prematura da proteção FK após webhook, truncagem de microssegundos no cursor e propagação do contrato de e-mail aos outros apps. Eles não foram contabilizados como novos achados. Os 18 achados das rodadas anteriores permanecem resolvidos.

## Verificação final

```text
VERIFICATION REPORT
-------------------
Claim: Testes unitários do workspace aprovados após as alterações finais de fonte.
Command: pnpm test
Executed: 2026-09-13, início dos testes finais aproximadamente 15:49 UTC.
Exit code: 0
Output summary: Tasks: 7 successful, 7 total; Cached: 3 cached, 7 total.
                Missão Saber 32; billing 193; emails 106; Cozya 86;
                Agenda 506; auth 216; ai-core 71 — 1.210 testes contabilizados.
Warnings: Turbo reutilizou cache de Missão Saber, auth e ai-core; os demais rodaram novamente.
Errors: none
Verdict: PASS — testes do workspace; cache explicitado.
```

```text
VERIFICATION REPORT
-------------------
Claim: Os cenários das cinco correções passam com PostgreSQL real e isolado.
Command: pnpm --filter @informach/missao-saber test:integration
Executed: 2026-09-13 15:50:21 UTC, após o ajuste final do fixture do evento terminal.
Exit code: 0
Output summary: Test Files 3 passed (3); Tests 27 passed (27).
                billing-lifecycle 10, operations 7, learning 10.
                Migrações aplicadas; banco descartável removido ao término.
Warnings: Notices de extensões já existentes e truncagem de identificador de uma migração antiga.
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: A experiência e a retomada por histórico funcionam em desktop e mobile.
Command: pnpm --filter @informach/missao-saber e2e
Executed: 2026-09-13, execução final após o cursor UUID, aproximadamente 15:48–15:50 UTC.
Exit code: 0
Output summary: 6 passed (1.5m). Navegação até a segunda página e retomada verificadas.
                Cadastro/OTP sandbox, perfis, missão, laboratório, caderno,
                diagnóstico, exportação, troca de perfil e logout também exercitados.
Warnings: Aviso de NO_COLOR/FORCE_COLOR do ambiente de testes.
Errors: none
Verdict: PASS — navegador e provedores locais controlados.
```

```text
VERIFICATION REPORT
-------------------
Claim: Tipos do workspace e geração de produção do Missão Saber aprovados.
Command: pnpm typecheck
         $env:MISSAO_ISOLATED_TEST = '1'; pnpm --filter @informach/missao-saber build
Executed: 2026-09-13, após as últimas alterações de fonte; build concluído antes de 15:51:31 UTC.
Exit code: 0 em ambos
Output summary: Tasks: 12 successful, 12 total; Cached: 7 cached, 12 total.
                Next compilou, gerou páginas e finalizou otimização; /historico incluído.
Warnings: Build direcionado para .next-e2e após encerrar E2E, preservando o cache do preview.
Errors: none
Verdict: PASS — build não é deploy.
```

```text
VERIFICATION REPORT
-------------------
Claim: Lint/formatação do escopo e consistência das migrações aprovados.
Command: pnpm exec biome check apps/missao-saber packages/billing/src/checkout-lifecycle.ts packages/billing/src/checkout.ts packages/billing/src/config.ts packages/billing/src/index.ts packages/billing/src/errors.ts packages/billing/src/subscriptions.ts packages/billing/src/sweepers.ts packages/billing/src/providers/stripe.ts packages/billing/src/providers/types.ts packages/billing/src/__tests__/stripe-checkout-lifecycle.test.ts packages/db/src/schema/billing.ts packages/emails/src/webhook.ts packages/emails/src/dispatch.ts packages/emails/src/__tests__/dispatch.test.ts apps/cozya/src/features/account/repository.ts apps/agenda-da-turma/src/features/account/repository.ts apps/cozya/src/features/emails/schemas.ts apps/cozya/src/features/emails/schemas.test.ts apps/agenda-da-turma/src/lib/sendgrid-webhook.ts apps/agenda-da-turma/src/lib/__tests__/sendgrid-webhook.test.ts
         pnpm --filter @informach/db exec drizzle-kit check
Executed: 2026-09-13, após as últimas alterações de fonte.
Exit code: 0 em ambos
Output summary: Checked 113 files in 145ms. No fixes applied.
                Drizzle: Everything's fine.
Warnings: O Biome ignora migrations por configuração do repositório; elas foram validadas pelo Drizzle e pela aplicação em bancos descartáveis.
Errors: none
Verdict: PASS — somente o escopo indicado.
```

```text
VERIFICATION REPORT
-------------------
Claim: Check global do monorepo.
Command: pnpm check
Executed: 2026-09-13, repetido ao término da verificação, antes de 15:51:31 UTC.
Exit code: 1
Output summary: Checked 1457 files. Found 4215 errors; 1971 warnings; 449 infos.
Warnings: Pendências fora do escopo, incluindo arquivos de pesquisa .firecrawl e outras áreas do monorepo.
Errors: O check global permanece reprovado. Os arquivos desta remediação passam no check focado acima.
Verdict: FAIL — não há afirmação de aprovação global do lint.
```

Ciclos vermelho/verde registrados: semana retornava 8 em vez de 7; a primeira solução da FK liberava a guarda após projeção; a primeira paginação encontrava apenas 21 das 36 sessões com microssegundos. Todos passam na versão final. Durante o desenvolvimento, dois fixtures foram corrigidos: nomes de campos do schema e o evento terminal Stripe, que precisava incluir o preço. Não foram removidas as asserções nem contornados os caminhos reais. Logs locais completos ficam em `apps/missao-saber/tmp/review-007/` (ignorados pelo Git).

## Entrega e próximos passos

As mudanças estão no workspace, prontas para revisão manual. Não houve commit, deploy, alteração de banco de produção, envio de e-mail real ou pagamento. Os testes usam PostgreSQL descartável, transportes controlados e OTP sandbox.

1. Na implantação, aplicar a migração gerada `0042_eager_lizard.sql` antes de servir o app e os guards atualizados de Cozya/Agenda. A razão da proteção FK está no [ADR 0001](../adrs/0001-checkout-lifecycle.md).
2. Em homologação, configurar Stripe em modo de teste e o webhook assinado do SendGrid; validar checkout, cancelamento, retentativas e entrega ponta a ponta com os provedores reais.
3. Para abrir vendas, concluir a revisão pedagógica humana da trilha, a configuração de preços/ambiente e o piloto com famílias previstos no PRD. Esses passos comerciais continuam pendentes e não são substituídos pelo review de software.
4. Tratar o passivo de lint global em tarefa própria; ele está separado da validação das correções desta rodada.
