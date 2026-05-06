# Reformulação do billing — Cozya como UI piloto

## Context

Hoje o backend de `@informach/billing` cobre todo o ciclo (subscription, créditos com reserve/commit, webhooks, sweepers, portal, checkout), mas a UI do Cozya só tem `/choose-plan` (onboarding) e `/settings/billing` (saldo + histórico + botão portal). Falta tudo o que a tabela do brief pede para ficar **dentro do app**: trocar mensal↔anual, cancelar at-period-end com retenção, reativar, comprar pacote de crédito. Stripe Portal continua sendo o destino só para cartão, fatura/PDF e retry past_due.

Além disso, há duas regras de negócio novas que o backend atual não suporta:

1. **Plano anual com drip mensal de créditos** — a cobrança é 1× ao ano, mas o usuário deve receber 100 créditos a cada ~30 dias (igual ao mensal), expirando ao fim do mês. Hoje `webhooks/invoice.ts` chama `grantBonusCredits` em todo `subscription_create`/`subscription_cycle`, o que para anual rodaria 1×/ano — bug.
2. **Migração real de plano** — upgrade mensal→anual com proration imediata, downgrade anual→mensal agendado para o fim do período (sem refund, mantém acesso, drip continua até a virada). Hoje o package só sabe `updateSubscription` direto e `cancelSubscription` at-period-end.

**Decisões alinhadas com o usuário:**

- **Escopo:** lógica nova compartilhada no package `@informach/billing` + UI plugada **só no Cozya**. Agenda-da-turma herda backend pronto, UI fica para próxima rodada.
- **Drip anual:** sweeper diário concede 100 créditos quando `nextCreditGrantAt <= now()` para subs anuais ativas; nova coluna `next_credit_grant_at` em `billing.subscriptions`.
- **Downgrade:** schedule no fim do período (`cancelAtPeriodEnd = true` + intent local `pendingProductId`/`pendingPriceId`); nova subscription criada quando o webhook `customer.subscription.deleted` chega.
- **Credit packs:** `products.ts` ganha 2 placeholders (`price_TODO_*`); UI já consome a lista filtrada por `kind: "credit_pack"`.

---

## Plano

A entrega é dividida em 6 fases. Cada uma é independentemente testável; a 6 só compila depois das 1-5.

### Fase 1 — Schema (`packages/db`)

**Arquivo:** `packages/db/src/schema/billing.ts`

Adicionar 3 colunas em `subscriptions` (todas nullable, mudança aditiva):

| Coluna | Tipo | Uso |
|---|---|---|
| `next_credit_grant_at` | `timestamptz` NULL | Próximo drip mensal. NULL = não faz drip (planos mensais ou Free). Setado para subs anuais. |
| `pending_product_id` | `text` NULL | Intent: produto que entra em vigor quando esta sub for cancelada at-period-end. |
| `pending_price_id` | `text` NULL | Stripe price correspondente ao `pending_product_id`. |

Índice novo: `subscriptions_next_grant_idx` em `(next_credit_grant_at)` `WHERE next_credit_grant_at IS NOT NULL` — para o sweeper varrer só as relevantes.

Gerar migration: `pnpm db:generate`. Validar nome (ex: `0013_*.sql`) e verificar que apenas `ALTER TABLE ADD COLUMN` + `CREATE INDEX` são emitidos.

### Fase 2 — Lógica nova no package billing

**2.1 — Helpers de plano**

Novo arquivo `packages/billing/src/plan-changes.ts` (contraparte de `subscriptions.ts` para mudanças de ciclo):

- `switchPlan(deps, { subscriptionId, newProductId, mode })` — `mode: "immediate" | "schedule_at_period_end"`.
  - **immediate**: chama `updateSubscription` interno com `prorationBehavior: "always_invoice"` (cobra a diferença agora). Recalcula `next_credit_grant_at` se virar anual (= próximo "boundary mensal" baseado em `currentPeriodStart`).
  - **schedule_at_period_end**: chama `provider.cancelSubscription({ atPeriodEnd: true })`, atualiza local com `cancel_at_period_end = currentPeriodEnd`, `pending_product_id = newProductId`, `pending_price_id = ...`. Quando chega `customer.subscription.deleted`, o handler aplica a intent (ver 2.2).
- `reactivateSubscription(deps, { subscriptionId })` — Stripe `subscriptions.update({ cancel_at_period_end: false })`. UPDATE local clear `cancel_at_period_end` + `pending_*`. Audit `billing.subscription_updated` com payload `{ reason: "reactivated" }`.
- `previewPlanChange(deps, { subscriptionId, newPriceId })` — chama `stripe.invoices.createPreview` (Dahlia) e retorna `{ amountDueCents, currency, prorationCreditCents, nextChargeAt }`. Necessário para o modal "Trocar para anual" mostrar quanto será cobrado agora.

Exportar via `packages/billing/src/index.ts` agregadas no `BillingService`.

**2.2 — Webhook `customer.subscription.deleted` aplica intent pendente**

Editar `packages/billing/src/webhooks/subscription.ts`. Quando processar `deleted`:

1. UPDATE local para `status: "canceled"` (já faz hoje).
2. Antes de retornar, ler `pending_product_id`/`pending_price_id` da row. Se setados, chamar `provider.createSubscription({ customer, items: [{ price: pendingPriceId }], default_payment_method: customer.default_source })` — reaproveita o cartão do customer (não passa por checkout; funciona porque já há método salvo).
3. UPSERT nova row em `subscriptions`. Inicializar `next_credit_grant_at` se for anual.
4. Se a chamada falhar (ex: cartão expirado), gravar `metadata.pendingPlanError` e disparar email `billing.payment-failed` (com copy específica de "agendamento de plano não pôde ser aplicado, atualize seu cartão"). Não retentar — usuário precisa reassinar manualmente.

**2.3 — Drip mensal de créditos no plano anual**

Editar `packages/billing/src/webhooks/invoice.ts` (linhas 71-84 — bloco `isCycle`):

- Carregar `product` antes do grant. Se `product.interval === "year"`:
  - **Não** chamar `grantBonusCredits` direto.
  - Em vez disso: na **primeira** factura anual (`subscription_create`), grantar 100 créditos imediatos + setar `next_credit_grant_at = now + 30d`. Em **renovações anuais** (`subscription_cycle`), apenas atualizar `next_credit_grant_at = now + 30d` (anchor reset).
- Se `product.interval === "month"`: comportamento atual permanece (grant 100 sempre).

Novo arquivo `packages/billing/src/sweepers.ts` — adicionar `grantPendingMonthlyBonusCredits`:

```
SELECT s.id, s.customer_id, s.product_id, s.next_credit_grant_at,
       c.subject_type, c.subject_id
FROM billing.subscriptions s
JOIN billing.customers c ON c.id = s.customer_id
WHERE s.next_credit_grant_at IS NOT NULL
  AND s.next_credit_grant_at <= now()
  AND s.status IN ('active', 'trialing')
  AND (s.cancel_at_period_end IS NULL OR s.cancel_at_period_end > s.next_credit_grant_at)
LIMIT batchSize;
```

Para cada row: `grantBonusCredits` com `stripeEventId = "drip:${subscriptionId}:${YYYY-MM}"` (idempotência), `expiresAt = next_credit_grant_at + 31d`. UPDATE `next_credit_grant_at = next_credit_grant_at + 30d`. Se já passou de `currentPeriodEnd` da sub, parar (= clear `next_credit_grant_at`).

Expor como `billing.grantPendingMonthlyBonusCredits()`. Assinatura igual aos outros sweepers (`{ scanned, granted, totalCredits }`).

**2.4 — Tests**

Adicionar em `packages/billing/src/__tests__/`:
- `plan-changes.test.ts` — switchPlan immediate vs schedule, reactivate, previewPlanChange.
- `webhooks-invoice-annual.test.ts` — anual NÃO grant em invoice.paid (apenas seta anchor).
- `sweepers-drip.test.ts` — drip respeita cancel_at_period_end, idempotência via stripeEventId, advance de anchor.
- `webhooks-subscription-pending.test.ts` — deleted aplica intent + cria nova sub; falha de cartão grava metadata error.

### Fase 3 — Cron route nova no Cozya

**Arquivo:** `apps/cozya/src/app/api/jobs/billing-grant-monthly/route.ts` — POST autenticado por `CRON_SECRET`, chama `billing.grantPendingMonthlyBonusCredits()`. Cadência **1×/dia** (mesmo container do `billing-expire-bonus`).

Atualizar `apps/cozya/src/features/billing/service.ts` para expor a função no objeto agregador.

### Fase 4 — Catálogo de credit packs

**Arquivo:** `packages/config/src/products.ts` — adicionar 3 entradas:

```ts
{
  id: "cozya_credits_100",
  app: "cozya",
  kind: "credit_pack",
  name: "100 créditos",
  creditAmount: 100,
  stripePriceId: { dev: "price_TODO_cozya_credits_100_dev", prod: "price_TODO_cozya_credits_100_prod" },
},
{ id: "cozya_credits_500", ..., creditAmount: 500, name: "500 créditos" },
{ id: "cozya_credits_1500", ..., creditAmount: 1500, name: "1500 créditos" },
```

Reutilizar `isStripePriceIdConfigured` (já existe) — UI esconde packs com price ID placeholder em produção, mas mostra em dev.

### Fase 5 — Server actions e UI no Cozya

**5.1 — Server actions** (novo arquivo `apps/cozya/src/features/billing/plan-actions.ts`):

- `switchToPlanAction({ targetProductId })` — decide `mode: "immediate" | "schedule_at_period_end"` baseado em `currentProduct.interval` vs `target.interval`:
  - mensal→anual: `immediate` (cobra agora).
  - anual→mensal: `schedule_at_period_end`.
  - Free→pago: redireciona para checkout (não passa por aqui).
- `previewPlanChangeAction({ targetProductId })` — retorna `{ amountDueCents, prorationCreditCents, nextChargeAt }` para o modal.
- `cancelSubscriptionAction({ reason? })` — `billing.cancelSubscription({ atPeriodEnd: true })`. Audit `billing.subscription_canceled` payload `{ reason }`.
- `reactivateSubscriptionAction()` — `billing.reactivateSubscription`.
- `purchaseCreditPackAction({ productId })` — `billing.createCreditPackCheckout({...})` e retorna URL.

Pattern: usar mesmo wrapper `action.input(...).auth(...).audit(...).run(...)` que `apps/cozya/src/features/billing/actions.ts:1` já usa para `createBillingPortalSessionAction`.

**5.2 — UI components** (todos em `apps/cozya/src/features/billing/components/`):

- **`plan-card.tsx`** (RSC com bordas client) — substitui o card "Plano atual" da página `/settings/billing`. Mostra: nome, status badge, próxima cobrança / data de fim do acesso (se cancel_at_period_end), copy "Você tem agendado: trocar para X em DD/MM" (se `pendingProductId` setado), botões "Trocar para anual/mensal", "Cancelar plano", "Reativar". Reusa `StatusBadge` e `formatDate` que já estão na page atual.
- **`switch-plan-dialog.tsx`** (client) — modal disparado por "Trocar para anual" / "Trocar para mensal". Fetch preview via `previewPlanChangeAction` no abrir. Mostra: "Cobrança agora R$ X (com R$ Y de crédito proporcional do plano atual)" para upgrade; "Você continua no anual até DD/MM. A partir daí, vai pagar R$ X/mês" para downgrade. Confirmação dispara `switchToPlanAction`.
- **`cancel-plan-dialog.tsx`** (client) — modal de retenção. Copy: "Você vai perder X créditos por mês e features Y/Z. Tem certeza?" Botões: "Manter plano" (fecha), "Cancelar mesmo assim" (dispara `cancelSubscriptionAction`). Sem flow de oferta de desconto nesta rodada (espaço reservado no DOM para fase 2).
- **`reactivate-banner.tsx`** (RSC) — banner amarelo quando `cancel_at_period_end IS NOT NULL`. Texto: "Plano cancelado, ativo até DD/MM. Reativar?" Botão dispara `reactivateSubscriptionAction`.
- **`credit-packs-section.tsx`** (RSC + botões client) — seção nova em `/settings/billing`. Lista pacotes via `PRODUCTS.filter(p => p.app === "cozya" && p.kind === "credit_pack")`. Esconde packs não configurados em prod. Cada card tem botão "Comprar" → `purchaseCreditPackAction` → `window.location.href = url`.

**5.3 — Página `/settings/billing` reescrita**

Editar `apps/cozya/src/app/(app)/settings/billing/page.tsx`:

- Manter headers, 3 cards (plano, créditos, expirando) e histórico atuais.
- **Substituir** o card "Plano atual" pela nova `<PlanCard />`.
- **Adicionar** `<ReactivateBanner />` no topo se `subscription?.cancelAtPeriodEnd` setado.
- **Adicionar** `<CreditPacksSection />` entre os 3 cards e o histórico.
- Botão `<BillingPortalButton />` mantido — agora explicitamente rotulado "Atualizar cartão / faturas" (em vez de "Gerenciar no Stripe"), reforçando a divisão da tabela do brief.

### Fase 6 — Verificação

1. **Tests do package:** `pnpm --filter @informach/billing test`. Esperado: tudo verde, incluindo os 4 novos arquivos. Cobertura de drip + intent pendente.
2. **Typecheck monorepo:** `pnpm typecheck`.
3. **Lint:** `pnpm check`.
4. **DB migration:** `pnpm db:generate` + `pnpm db:migrate` em DB local. Verificar `\d billing.subscriptions` no `pnpm db:studio` que as 3 colunas e o índice apareceram.
5. **E2E manual via Cozya** (`pnpm dev:cozya` → http://localhost:3002):
   - Onboarding novo: assinar Pro mensal → confirmar saldo +100 + ledger entry.
   - `/settings/billing`: clicar "Trocar para anual" → modal mostra preview com proration → confirmar → ver Stripe cobrar imediato (Stripe CLI `stripe listen` redirecionando webhooks) → status volta com `productId: cozya_pro_annual`, `next_credit_grant_at` setado.
   - Avançar relógio (ou rodar manualmente o cron): `curl -X POST http://localhost:3002/api/jobs/billing-grant-monthly -H "Authorization: Bearer $CRON_SECRET"` → ver +100 créditos no ledger.
   - Cancelar pelo modal de retenção → status mantém active mas com banner "ativo até DD/MM" → reativar → banner some.
   - "Trocar para mensal" → modal explica fim-de-período → confirmar → row mostra `pending_product_id: cozya_pro_monthly`. Avançar período no Stripe (`stripe trigger customer.subscription.deleted`) → ver nova subscription mensal criada automaticamente.
   - Comprar pacote 100 créditos → Stripe Checkout → success → ledger ganha entry `purchase`.
6. **Webhook coverage:** `stripe trigger invoice.paid` em sub anual de teste → confirmar via log que **não** rodou `grantBonusCredits` (apenas `next_credit_grant_at` foi atualizado).
7. **Idempotência drip:** rodar o cron 2× seguidas no mesmo dia → segunda chamada deve retornar `granted: 0` (UNIQUE em `creditLedger.stripeEventId`).

---

## Arquivos críticos a modificar

| Caminho | Tipo de mudança |
|---|---|
| `packages/db/src/schema/billing.ts` | Adicionar 3 colunas + 1 índice em `subscriptions`. |
| `packages/db/src/migrations/00XX_*.sql` | Gerada por `db:generate` (não escrever à mão). |
| `packages/billing/src/plan-changes.ts` | **Novo** — `switchPlan`, `reactivateSubscription`, `previewPlanChange`. |
| `packages/billing/src/sweepers.ts` | Adicionar `grantPendingMonthlyBonusCredits` (segue padrão dos existentes). |
| `packages/billing/src/webhooks/invoice.ts` | Ramificar `month` vs `year` no bloco `isCycle` (linhas 71-84). |
| `packages/billing/src/webhooks/subscription.ts` | Aplicar `pending_product_id` em `customer.subscription.deleted`. |
| `packages/billing/src/index.ts` | Expor novas funções no `BillingService`. |
| `packages/billing/src/__tests__/*` | 4 arquivos de teste novos (cobertos em 2.4). |
| `packages/config/src/products.ts` | 3 credit packs com `price_TODO_*`. |
| `apps/cozya/src/features/billing/service.ts` | Expor `grantPendingMonthlyBonusCredits` no agregador. |
| `apps/cozya/src/features/billing/plan-actions.ts` | **Novo** — 5 server actions. |
| `apps/cozya/src/features/billing/components/plan-card.tsx` | **Novo**. |
| `apps/cozya/src/features/billing/components/switch-plan-dialog.tsx` | **Novo**. |
| `apps/cozya/src/features/billing/components/cancel-plan-dialog.tsx` | **Novo**. |
| `apps/cozya/src/features/billing/components/reactivate-banner.tsx` | **Novo**. |
| `apps/cozya/src/features/billing/components/credit-packs-section.tsx` | **Novo**. |
| `apps/cozya/src/app/(app)/settings/billing/page.tsx` | Refatorar para usar componentes novos. |
| `apps/cozya/src/app/api/jobs/billing-grant-monthly/route.ts` | **Novo** cron route. |
| `apps/cozya/messages/pt-BR.json` (se existir namespace billing) | Strings dos novos modais. |

## Funções/utilitários existentes a reutilizar

| O quê | Onde |
|---|---|
| `updateSubscription`, `cancelSubscription`, `cancelBillingForSubject` | `packages/billing/src/subscriptions.ts:81-217` |
| `grantBonusCredits` (idempotente via `stripeEventId`) | `packages/billing/src/credits/grant.ts` |
| `createPortalSession`, `createSubscriptionCheckout`, `createCreditPackCheckout` | `packages/billing/src/{portal,checkout}.ts` |
| `findProduct`, `getStripePriceId`, `isStripePriceIdConfigured` | `packages/config/src/products.ts:81-87` |
| `BillingPortalButton` (a ser rotulado "Atualizar cartão / faturas") | `apps/cozya/src/features/billing/components/billing-portal-button.tsx` |
| `requireUserServer`, `getServerSession` | `apps/cozya/src/lib/auth.ts` |
| `resolveSubjectEmail` (passada para `createBillingService`) | `apps/cozya/src/features/billing/repository.ts` |
| `StatusBadge`, `ledgerLabel`, `formatDate`, `formatNumber` | `apps/cozya/src/app/(app)/settings/billing/page.tsx:152-193` (extrair para `apps/cozya/src/features/billing/lib/format.ts` na fase 5). |
| Webhook idempotency layers (3 camadas) | `packages/billing/CLAUDE.md` §2 |
| Pattern de cron route com `CRON_SECRET` | `apps/cozya/src/app/api/jobs/billing-reconcile/route.ts` |

## Riscos conhecidos

1. **Cartão expirado no flip de plano (downgrade aplicado)** — usuário pode ficar sem plano. Mitigação: email `billing.payment-failed` + linkar Stripe Portal para atualizar cartão. Documentar no copy do modal de switch que "se o cartão expirar antes da virada, você vai precisar reassinar".
2. **`stripe.invoices.createPreview` na Dahlia** — confirmar via context7 que o nome do método não mudou (em versões anteriores era `retrieveUpcoming`). Se mudou, ajustar `previewPlanChange`.
3. **Drift entre `next_credit_grant_at` e `currentPeriodEnd`** — se Stripe alterar a data do ciclo (ex: dunning move o período), o anchor pode passar do period_end. O sweeper deve clear `next_credit_grant_at` quando ultrapassa — incluído na lógica.
4. **Concorrência de cron** — drip e expire podem rodar no mesmo minuto. Como ambos só inserem em `creditLedger` com `stripeEventId` únicos diferentes, não há conflito.
