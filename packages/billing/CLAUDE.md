# `@informach/billing` — package guide

> Documentação primária do package para humanos e agentes. Para checklist de produção (Stripe Dashboard, webhooks, cron jobs no Railway, NF-e/PCI), ver [`PRODUCTION.md`](./PRODUCTION.md). Para integração com email transacional, ver [`@informach/emails/CLAUDE.md`](../emails/CLAUDE.md). Para audit/permission integration, ver [`@informach/auth/CLAUDE.md`](../auth/CLAUDE.md).

---

## 1. Propósito

`@informach/billing` é o motor de monetização dos apps Next.js do monorepo `informach-platform`. Encapsula **dois modelos de cobrança lado a lado** sob a mesma API e schema:

- **Subscriptions recorrentes** (planos mensais/anuais) com Stripe Checkout, Customer Portal hospedado, dunning, proração, cancelamento end-of-period.
- **Pagamentos pontuais** especificamente para compra de pacotes de **créditos de IA** consumidos em chamadas LLM via `@informach/ai-core`.

Provider único hoje é **Stripe** (versão pin `2026-04-22.dahlia`), mas a abstração `BillingProviderClient` permite adicionar Asaas (Pix/Boleto BR) sem refator.

O package **não** lê env vars próprias, **não** decide UI, **não** renderiza páginas. Cada app fornece:
1. Config via `createBillingService({...})` em `apps/<app>/src/lib/billing.ts`
2. Webhook route `app/api/webhooks/stripe/route.ts`
3. Cron routes `app/api/jobs/billing-{reconcile,expire-bonus,grant-monthly,release-reservations,dunning}/route.ts`
4. UI pages que consomem o `BillingService` via server actions/RSC

---

## 2. Como funciona (diagrama mental)

```
apps/<app>/src/lib/
  ├── env.ts            ← Zod-validated STRIPE_*
  ├── emails.ts         ← createEmailService de @informach/emails
  ├── auth.ts           ← createAuth({ accountDeletion.onBeforeDelete → billing.cancelBillingForSubject })
  ├── observability.ts  ← packageLogger/authObservability app-level
  └── billing.ts        ← createBillingService({...}) → exporta `billing`

apps/<app>/src/app/api/
  ├── webhooks/stripe/route.ts          ← billing.verifyWebhookSignature + billing.handleStripeEvent
  └── jobs/
      ├── billing-reconcile/route.ts        ← billing.reconcileSubscriptions (1×/dia)
      ├── billing-expire-bonus/route.ts     ← billing.expireMonthlyBonusCredits (1×/dia)
      ├── billing-grant-monthly/route.ts    ← billing.grantPendingMonthlyBonusCredits (1×/dia, drip anual)
      ├── billing-release-reservations/route.ts ← billing.releaseExpiredReservations (a cada 5 min)
      └── billing-dunning/route.ts          ← billing.retryDunningEmails (a cada 6h, com send fn próprio)

@informach/billing source
  ├── index.ts                  ← createBillingService factory + BillingService type
  ├── config.ts                 ← BillingServiceConfig
  ├── errors.ts                 ← BillingError + 11 subclasses
  ├── types.ts                  ← SubjectRef, BillingProvider, CreditOwner, audit types
  ├── access.ts                 ← PRO_STATUSES + getProSubscription/hasProSubscription (Pro entitlement gate)
  ├── customers.ts              ← getOrCreateCustomer (idempotent + race-safe)
  ├── checkout.ts               ← createSubscriptionCheckout (single-sub guard), createCreditPackCheckout (Pro gate)
  ├── portal.ts                 ← createPortalSession
  ├── subscriptions.ts          ← get/list/cancel/update + cancelBillingForSubject (LGPD)
  ├── plan-changes.ts           ← switchPlan (immediate/scheduled), reactivateSubscription, previewPlanChange
  ├── billing-emails.ts         ← sendBillingEmail (4 categorias billing.*)
  ├── sweepers.ts               ← reconcile + expire + release + retryDunning + grantPendingMonthlyBonus
  ├── credits/
  │   ├── balance.ts            ← getBalance (single round-trip)
  │   ├── history.ts            ← getCreditHistory (keyset pagination)
  │   ├── grant.ts              ← grantBonusCredits, refundCredits (idempotent via stripeEventId)
  │   └── reservations.ts       ← reserve+commit/release + consumeCredits (advisory lock)
  ├── webhooks/
  │   ├── index.ts              ← verifyStripeSignature + handleStripeEvent (dispatcher)
  │   ├── checkout.ts           ← handleCheckoutSessionCompleted
  │   ├── subscription.ts       ← handleSubscriptionLifecycle (priceId-first; aplica pending intent em deleted)
  │   ├── invoice.ts            ← handleInvoicePaid (cycle-only grant; annual drip anchor) + handleInvoicePaymentFailed
  │   └── payment.ts            ← handlePaymentIntentSucceeded
  └── providers/
      ├── types.ts              ← interface BillingProviderClient
      └── stripe.ts             ← StripeProvider (stripe-node v22.1)
```

### Tabelas no schema `billing` (em `packages/db/src/schema/billing.ts`)

7 tabelas, schema Postgres dedicado (NÃO `core` — separação por compliance/retenção fiscal):

- **`customers`** — mapping `(provider, subjectType, subjectId) → providerCustomerId`. UNIQUE `(provider, subjectType, subjectId)` e `(provider, providerCustomerId)`.
- **`subscriptions`** — cache local da subscription Stripe (status, periodos, cancel_at_period_end). UNIQUE `(provider, providerSubscriptionId)`. Source of truth = Stripe; reconcile sweeper recupera drift.
  - `next_credit_grant_at` (timestamptz NULL) — drip mensal de créditos no plano anual; sweeper diário concede bonus quando vence. NULL para mensais (recebem grant via `invoice.paid`) e Free.
  - `pending_product_id` / `pending_price_id` (text NULL) — intent armazenada por `switchPlan(mode='schedule_at_period_end')`; aplicada quando o webhook `customer.subscription.deleted` chega (downgrade no fim do período).
  - Índice parcial `subscriptions_next_grant_idx` em `next_credit_grant_at WHERE NOT NULL` — permite varredura O(N candidatos), não O(N total).
- **`oneTimePayments`** — pagamentos pontuais (compras de credit pack). UNIQUE `(provider, providerPaymentId)`.
- **`creditLedger`** — append-only, fonte da verdade do saldo. `entryType` enum (purchase/bonus_grant/promo_grant/consumption/refund/expiration/adjustment), `amount` positivo ou negativo conforme tipo. UNIQUE parcial `stripeEventId WHERE NOT NULL` (idempotência fina). Check constraint de sinal.
- **`creditReservations`** — soft-lock de saldo. Status active/committed/released/expired, `expiresAt`, `pricingId` para snapshot de preço.
- **`creditPricing`** — versionado. UNIQUE parcial `(feature, model) WHERE effective_to IS NULL` garante 1 linha ativa por (feature, model).
- **`webhookEvents`** — primeira camada de idempotência. UNIQUE `(provider, providerEventId)`. `processing_started_at` funciona como claim persistente: duplicatas em andamento são deduped; tentativas com erro ou stale são reprocessadas.

### Idempotência em 3 camadas

Stripe retransmite webhooks (rede, retry policy) — defesas independentes:
1. **`webhookEvents.(provider, providerEventId)` UNIQUE + claim** — handler não dispatcheia duplicata em paralelo; retry só para erro/stale
2. **`{oneTimePayments,subscriptions}.(provider, provider*Id)` UNIQUE** — table-level dedup
3. **`creditLedger.stripeEventId` UNIQUE parcial** — defesa final no ledger
4. **`emailDeliveries.(category, messageKey)` UNIQUE** (em `@informach/emails`) — defesa para emails transacionais

Mesmo se 3 webhooks idênticos chegarem em paralelo, apenas 1 grava ledger/email.

---

## 3. Funcionalidades

### 3.1 Customers — `getOrCreateCustomer({ subject, email, metadata? })`

Idempotente: SELECT por `(provider, subject)`; se não existe, chama `provider.createCustomer` e INSERT. Race-safe: insert com `onConflictDoNothing` + SELECT pós-conflict para retornar o vencedor. Rejeita `subject.type='organization'` quando `organizationsEnabled: false` via `OrganizationsDisabledError`.

### 3.2 Checkout — Stripe Hosted

- **`createSubscriptionCheckout({ subject, actorId?, productId, successUrl, cancelUrl, trialDays? })`** — valida product `kind='subscription'`, **rejeita com `AlreadySubscribedError` se já existe sub `active`/`trialing`/`past_due` para o subject** (single-subscription invariant — apps devem rotear o user para `switchPlan` em vez de criar paralela). Resolve email, faz `getOrCreateCustomer`, chama `stripe.checkout.sessions.create({ mode: "subscription", ... })`. Metadata propagada: `subject_type`, `subject_id`, `product_id`. Emite `billing.checkout_started` com `checkoutSessionId`, `productId`, `subjectType`, `subjectId`, `mode: "subscription"` e `actorId` quando recebido.
- **`createCreditPackCheckout({ subject, actorId?, productId, successUrl, cancelUrl })`** — valida `kind='credit_pack'` + `creditAmount > 0`. **Pro-only gate**: chama `getProSubscription` antes de qualquer outra coisa; se subject não tem sub `active`/`trialing`, lança `SubscriptionRequiredError("credit packs")`. `mode: "payment"` + `payment_intent_data.metadata` com `credit_amount` (string-encoded, payload do webhook). Emite `billing.checkout_started` com `mode: "payment"` e `creditAmount`.

`idempotencyKey` formato: `${operation}:${subjectType}:${subjectId}:${productId}:${nonce}`. Quando `nonce` é omitido, o helper deriva `auto:${floor(now/300_000)}` — chave estável por janela de 5min (cobre double-click / refresh sem bloquear retries legítimos da próxima sessão). Stripe TTL 24h.

### 3.3 Subscriptions

| Método | Descrição |
|---|---|
| `getSubscription(subject)` | Primeira sub com status IN (active, trialing, past_due). **NÃO usar para feature gating** — esse é só o lookup para exibir status na UI ("Pagamento pendente" etc). |
| `hasProSubscription(subject)` | **Single source of truth para "é Pro agora?"** — `true` apenas quando status ∈ `PRO_STATUSES` (`active` ou `trialing`). Ver §3.11. |
| `listSubscriptions(subject)` | Todas (qualquer status) |
| `cancelSubscription({ subscriptionId, actorId?, reason?, atPeriodEnd? })` | Default `atPeriodEnd: true`; false = immediate. UPDATE local otimisticamente, webhook reconcilia. `reason` deve ser enum controlado pelo app, nunca texto livre. |
| `updateSubscription({ subscriptionId, newPriceId, prorationBehavior? })` | Low-level price swap (raw — `switchPlan` é o caminho preferido). |
| `createPortalSession({ subject, returnUrl })` | Gera URL do Stripe Billing Portal. Throw `CustomerNotFoundError` se subject sem customer. |
| `cancelBillingForSubject(subject)` | **LGPD hook**. Cancela TODAS as subs ativas IMMEDIATELY; rows ficam (NF-e/fiscal). Try/catch por sub — falha não aborta loop. Retorna `{ canceled, failed }`. |

#### Plan changes (`plan-changes.ts`)

UX-aware wrappers acima de `updateSubscription`/`cancelSubscription`. Apps usam estes em vez do raw quando o usuário clica "Trocar de plano" / "Reativar".

| Método | Descrição |
|---|---|
| `switchPlan({ subscriptionId, actorId?, newProductId, mode })` | `mode: "immediate"` chama `updateSubscription` com `proration_behavior: "always_invoice"` + `payment_behavior: "pending_if_incomplete"` (cobra agora sem aplicar localmente se a invoice ficar aberta). `mode: "schedule_at_period_end"` marca `cancel_at_period_end` e grava `pending_product_id`/`pending_price_id` — quando o webhook `subscription.deleted` chega no fim do período, o handler cria a nova sub via `provider.createSubscription`. Retorna `{ subscription, appliedImmediately, paymentActionUrl }`. |
| `reactivateSubscription({ subscriptionId, actorId? })` | Stripe `subscriptions.update({ cancel_at_period_end: false })`. UPDATE local clear `cancel_at_period_end` + `pending_product_id`/`pending_price_id`. |
| `previewPlanChange({ subject, subscriptionId, newProductId })` | Usa `stripe.invoices.createPreview` (Dahlia/Basil — substitui `retrieveUpcoming`). Retorna `{ subtotalCents, prorationCreditCents, amountDueCents, currency, nextChargeAt }` para a UI mostrar "R$180 − R$57 = R$123 agora". |

`switchPlan(immediate).paymentActionUrl`: quando o `updateSubscription` deixa a invoice em `status='open'`/`uncollectible` (cliente sem default payment method, SCA, cartão recusado), o helper retorna a `hosted_invoice_url` para a UI redirecionar e mantém a subscription local no plano antigo. Só quando a invoice já veio paga o helper atualiza produto/preço local e seed do drip anual.

Quando `switchPlan(immediate)` muda para um plano anual com `bonusCreditsPerMonth`, o `next_credit_grant_at` é seedado em `now + 30d` (drip mensal arranca 30 dias após o upgrade — não 12 grants imediatos).

### 3.4 Credits — Balance + History + Grant

- **`getBalance(owner): { total, reserved, available, expiringSoon }`** — single round-trip via `db.execute(sql\`...\`)` com 4 subqueries scalares. Coerce bigint string → number. `available = total - reserved`. `expiringSoon` lista bônus que vencem em ≤7 dias.
- **`getCreditHistory(owner, filters?)`** — keyset pagination ordenada por `(createdAt DESC, id DESC)` (matches `credit_ledger_owner_created_idx`). Cursor é base64url de `<iso>|<uuid>`. Filtros opcionais: `from`, `to`, `entryTypes[]`. Default limit 50, max 200.
- **`grantBonusCredits({ owner, amount, reason, expiresAt?, stripeEventId?, metadata? })`** — INSERT `entryType='bonus_grant'|'promo_grant'|'adjustment'` (mapeado por `reason`). Idempotente via `stripeEventId` UNIQUE quando presente. Sem `stripeEventId`, INSERT direto sem dedup (admin grant manual).
- **`refundCredits({ owner, originalLedgerEntryId, amount, stripeEventId, reason })`** — INSERT entry negativo `entryType='refund'`. Idempotente via `stripeEventId` UNIQUE (obrigatório).

### 3.5 Credits — Reserve + Commit/Release (race-free)

Padrão **PaymentIntent-style** para débito atômico em chamadas LLM:

```ts
const reservation = await billing.reserveCredits({
  owner, estimatedAmount: 200, app: "cozya", feature: "llm.text", model, ttlSeconds: 600,
});
try {
  const result = await callLLM(...);
  const { ledgerEntryId, balanceAfter } = await billing.commitReservation({
    reservationId: reservation.id, actualAmount: actualTokens * pricePerToken,
  });
} catch (err) {
  await billing.releaseReservation({ reservationId: reservation.id, reason: "llm_error" });
  throw err;
}
```

**Atomicidade:** todas as 3 operações dentro de `db.transaction({ isolationLevel: "read committed" })` + `pg_advisory_xact_lock(hashtext("${ownerType}:${ownerId}"))`. Lock é O(1), escopo de transação (auto-released no COMMIT/ROLLBACK), serializa apenas operações do MESMO owner — diferentes owners nunca bloqueiam-se.

**`reserveCredits`** check de saldo: `total - reserved_active_others ≥ estimatedAmount`. Throw `InsufficientCreditsError(available, requested)` se insuficiente. Aceita `reservationId` opcional para callers que precisam prealocar o UUID; se omitido, o billing gera um UUID e usa esse mesmo valor como `runId` default.

**`commitReservation`** TOCTOU guard: re-SELECT status após lock. Throw `ReservationAlreadyResolvedError` ou `ReservationExpiredError` (e marca como expired atomicamente). Caso normal: UPDATE `status='committed'` + INSERT ledger consumption com `reservationId` ligado.

**`releaseReservation`** UPDATE `WHERE status='active'` — idempotente, no-op silencioso se já resolvida.

**`consumeCredits({ owner, amount, app, feature, model?, runId? })`** — atalho síncrono que faz lock+check+insert numa transaction (sem criar row de reservation). Retorna union: `{ ok: true, ledgerEntryId, balanceAfter } | { ok: false, code: "INSUFFICIENT_BALANCE", balance }`.

Use o **wrapper `withCredits` em `@informach/ai-core`** (ou sub-path `@informach/ai-core/billing`) para o ciclo completo — ele prealoca o UUID, valida os amounts e esconde a complexidade de orquestrar reserve/commit/release.

### 3.6 Webhook handling — `verifyWebhookSignature` + `handleStripeEvent`

Apps fazem:
```ts
const event = billing.verifyWebhookSignature(rawBody, request.headers.get("stripe-signature"));
const result = await billing.handleStripeEvent(event);
```

Eventos roteados:

| Event type | Handler | Side effect |
|---|---|---|
| `checkout.session.completed` (mode=subscription) | `webhooks/checkout.ts` | Loga apenas — sub vem via `customer.subscription.created` |
| `checkout.session.completed` (mode=payment) | `webhooks/checkout.ts` | Loga — credits granted via `payment_intent.succeeded` |
| `customer.subscription.created` | `webhooks/subscription.ts` | UPSERT subscription row (productId resolvido via priceId, ver abaixo), audit `billing.subscription_created` |
| `customer.subscription.updated` | `webhooks/subscription.ts` | UPSERT; se `cancel_at_period_end` set → email `billing.subscription-canceled` |
| `customer.subscription.deleted` | `webhooks/subscription.ts` | status='canceled' + clear `next_credit_grant_at`. Se `pending_product_id` setado, **aplica intent**: chama `provider.createSubscription` para o pending price, persiste a nova sub local; em falha (cartão expirado etc.), grava `metadata.pendingPlanError` e clear pending. Audit + email `billing.subscription-canceled`. |
| `payment_intent.succeeded` | `webhooks/payment.ts` | Para credit pack: INSERT `oneTimePayments` + `creditLedger purchase`, email `billing.credits-purchased` |
| `invoice.paid` | `webhooks/invoice.ts` | Cycle-only grant: **`subscription_update` é EXPLICITAMENTE excluído** de `isCycle` (mid-cycle changes não são renovação — granting aqui dobraria os créditos do mês). Para mensal: `subscription_create`/`subscription_cycle` → `grantBonusCredits` + emails. Para anual: `subscription_create` → grant + anchor `next_credit_grant_at = now + 30d`; `subscription_cycle` (renovação anual) → só reseta o anchor (não re-grant). |
| `invoice.payment_failed` | `webhooks/invoice.ts` | status='past_due', metadata.dunning.pending=true. Email enviado pelo sweeper depois |

Outros eventos retornam `reason: "ignored"` sem efeito.

**Resolução de produto via `priceId` (autoritativo)**: Stripe metadata é setado uma vez no checkout e NÃO migra quando `subscriptions.update` swap o price (ex: upgrade mensal→anual). Por isso `webhooks/subscription.ts` e `webhooks/invoice.ts` resolvem o `productId` do catálogo via `stripePriceId.{dev,prod}` primeiro, com fallback para `metadata.product_id` apenas quando o priceId não está no catálogo. Drift entre os dois é logado como warn.

### 3.7 Sweepers (cron-friendly)

Todos idempotentes, async, retornam contagens. Expostos como métodos do `BillingService` para apps consumirem direto sem manipular `providerClient`.

| Método | Cadence | O que faz |
|---|---|---|
| `reconcileSubscriptions(opts?)` | 1×/dia | Para cada local sub não-terminal: `provider.retrieveSubscription`. Se Stripe null → marca canceled. Se status/period diverge → UPDATE local. Recupera webhook perdido. |
| `expireMonthlyBonusCredits(opts?)` | 1×/dia | INSERT entries `expiration` negativos para bonus/promo/purchase com `expires_at <= now()` e SEM entry compensatória ainda (anti-join `NOT EXISTS metadata->>'originalEntryId'`). Entries `expiration` são histórico/auditoria e ficam fora do saldo ativo, porque o positivo expirado já sai pelo filtro `expires_at`. |
| `grantPendingMonthlyBonusCredits(opts?)` | 1×/dia | **Drip mensal de créditos no plano anual.** Para cada sub `active`/`trialing` com `next_credit_grant_at <= now()`: se `anchor + 30d` cairia depois de `cancel_at_period_end`/`current_period_end`, clear o anchor sem grant; caso contrário chama `grantBonusCredits` com `stripeEventId='drip:<subId>:<YYYY-MM-DD>'` e avança o anchor 30d. |
| `releaseExpiredReservations(opts?)` | 5 min | UPDATE reservations `status='active' AND expires_at <= now()` para `'expired'`. Libera lock soft de saldo. |
| `retryDunningEmails({ send, maxAttempts?, cooldownHours? })` | 6h | Scan past_due subs, throttle por `metadata.dunning.{attempts, lastSentAt}`, chama `send({...})` (app fornece). Sem `send` = dry-run. |

### 3.8 Email transacional (4 categorias `billing.*`)

Quando `config.sendEmail` + `config.renderTemplate` estão presentes, webhook handlers disparam emails:

| Categoria | Disparado por | Helper props |
|---|---|---|
| `billing.payment-success` | `invoice.paid` (subscription_create) | `productName, amountFormatted` |
| `billing.subscription-renewed` | `invoice.paid` (subscription_cycle) | `productName, nextBillingDate` |
| `billing.subscription-canceled` | `subscription.deleted` OR `subscription.updated` (cancel_at_period_end) | `productName, accessUntil` |
| `billing.credits-purchased` | `payment_intent.succeeded` (credit pack) | `creditAmount, balanceAfter` |

A 5ª categoria — **`billing.payment-failed`** — NÃO é disparada por webhook; vem do **sweeper `retryDunningEmails`** que o app chama com seu próprio `send` fn (templates ficam em `@informach/emails`). Isso permite throttling/retry sem bloquear o webhook ack.

Helper `sendBillingEmail` em `src/billing-emails.ts` valida deps, monta `unsubscribeUrl` via `config.buildUnsubscribeUrl(identifier, category)`, mapeia props da union pra template (ex: `manageBillingUrl` vira `reactivateUrl` em subscription-canceled), try/catch em render+send (erros viram `render_failed`/`send_failed`, NÃO propagam).

`messageKey` por categoria garante idempotência no `dispatchEmail`:
- `payment-success`: `payment_success_${invoiceId}`
- `subscription-renewed`: `subscription_renewed_${invoiceId}`
- `subscription-canceled`: `subscription_canceled_${subscriptionId}` ou `subscription_cancel_scheduled_${subscriptionId}_${canceledAt}`
- `credits-purchased`: `${ledgerEntryId}` (estável por Stripe event)
- `payment-failed`: `dunning_${invoiceId}_${attempt}` (gerenciado pelo sweeper)

### 3.9 Audit log (em `audit.events` via `@informach/auth`)

9 audit event types declarados em `@informach/auth/audit.ts`:

```
billing.checkout_started
billing.subscription_created
billing.subscription_updated
billing.subscription_canceled
billing.payment_succeeded
billing.payment_failed
billing.credits_granted
billing.credits_consumed
billing.credits_refunded
```

Apps wireiam `config.onAudit` para chamar `logAuditEvent(event.eventType, event.actorId, event.payload)` (re-exportado de `@informach/auth`). Pattern: fire-and-forget com `.catch` para logger — audit emit nunca bloqueia o billing call.
Nos apps atuais, erros/warnings desses emit-points passam pelo `packageLogger` de `src/lib/observability.ts`, que mantém pino e duplica `warn`/`error` sanitizados para Sentry.

Payloads seguem [`docs/audit-payload-policy.md`](../../docs/audit-payload-policy.md): preferir IDs internos/Stripe, status e reason; não gravar payload bruto de webhook, tokens, secrets, dados de cartão ou motivo de cancelamento em texto livre.

### 3.10 LGPD/Account deletion hook

`cancelBillingForSubject(subject)` é chamado pelo `accountDeletion.onBeforeDelete` do auth (configurado nos apps). Cancela TODAS as subs ativas do subject IMMEDIATELY. Rows NÃO deletadas — `subjectId` retido para retenção fiscal/NF-e. PII anonymization é responsabilidade do app (em outras tabelas).

### 3.11 Pro entitlement (`access.ts`) — single source of truth

Toda decisão de "esse subject é Pro agora?" passa por `getProSubscription` / `hasProSubscription` em `src/access.ts`. Existe uma constante única:

```ts
export const PRO_STATUSES = ["active", "trialing"] as const;
```

**O que conta como Pro:**
- `active` — pagamento confirmado. Inclui o caso "cancelado at-period-end": Stripe mantém `status='active'` enquanto `cancel_at_period_end=true` e o período pago não acabou; só vira `canceled` no webhook `customer.subscription.deleted` na virada. Logo, **se o user cancelou mas ainda tem dias pagos, continua Pro até o período expirar — automaticamente coberto**.
- `trialing` — período concedido explicitamente pelo produto (decisão do time, duração configurável via `trialDays` no checkout).

**O que NÃO conta:**
- `past_due` — cobrança falhou. Dunning sweeper recupera (volta para `active`) ou desiste (vira `canceled`). Sem acesso enquanto isso.
- `unpaid`, `incomplete`, `incomplete_expired`, `paused`, `canceled` — todos negativos.

**Para mudar a regra**: editar `PRO_STATUSES` em `access.ts`. Cada feature gate (credit pack, IA, importação por imagem, etc.) já consome esse helper, então uma única linha propaga para todo lugar. Por exemplo, adicionar grace period em past_due viraria `["active", "trialing", "past_due"]`.

**API:**
- `BillingService.hasProSubscription(subject): Promise<boolean>` — para gates simples em RSC/server actions.
- `getProSubscription(deps, subject)` (export raw) — quando o caller precisa da row em si (nome do plano, etc.).
- `PRO_STATUSES` (constante exportada) — caller direto via SQL custom.

**Anti-pattern:** inline `subscription.status === "active"` ou `inArray(status, ["active", "trialing"])` em features. Sempre passar pelo helper, mesmo quando parece trivial — a regra muda; a indireção mantém isso barato.

---

## 4. Como cada app usa o package

### 4.1 Wire-up obrigatório

```ts
// apps/<app>/src/lib/billing.ts
import { logAuditEvent } from "@informach/auth";
import { createBillingService, type SubjectRef } from "@informach/billing";
import { APPS, PRODUCTS } from "@informach/config";
import { db } from "@informach/db";
import { users /* , organizations */ } from "@informach/db/schema";
import { buildUnsubscribeToken } from "@informach/emails";
import { eq } from "drizzle-orm";
import { emails } from "./emails";
import { env } from "./env";
import { packageLogger } from "./observability";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
const stripeMode = env.STRIPE_MODE ?? (env.NODE_ENV === "production" ? "prod" : "dev");

async function resolveSubjectEmail(subject: SubjectRef): Promise<string> {
  // SELECT users.email WHERE id=subject.id (cozya: só user; agenda: user OR org via JOIN)
  // ...
}

export const billing = createBillingService({
  provider: "stripe",
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  db,
  appName: APPS.<app>.name,
  publicAppUrl: env.NEXT_PUBLIC_APP_URL,
  products: PRODUCTS.filter((p) => p.app === APPS.<app>.slug),
  organizationsEnabled: true /* false em cozya */,
  stripeMode,
  resolveSubjectEmail,
  logger: packageLogger,
  // Email integration:
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  manageBillingUrl: `${env.NEXT_PUBLIC_APP_URL}/admin/billing`, // ou /settings/billing
  buildUnsubscribeUrl: (identifier, category) => {
    const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category);
    return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
  },
  unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
  // Audit:
  onAudit: (event) => {
    logAuditEvent(event.eventType, event.actorId, event.payload).catch((err) => {
      packageLogger.error("billing.audit.persist_failed", {
        eventType: event.eventType,
        error: String(err),
      });
    });
  },
});
```

Quando `runId` não é passado, `reserveCredits` usa o próprio UUID da reserva como `runId`. O wrapper `withCredits` de `@informach/ai-core` prealoca esse UUID e o envia como `reservationId` + `runId`, mantendo `billing.credit_ledger.run_id` alinhado com `ai.agent_runs.id` e `agent.generate({ runId })`.

```ts
// apps/<app>/src/lib/auth.ts — LGPD hook
import { billing } from "./billing";
import { packageLogger } from "./observability";

createAuth({
  // ... outros campos
  accountDeletion: {
    enabled: true,
    onBeforeDelete: async (user) => {
      const result = await billing.cancelBillingForSubject({ type: "user", id: user.id });
      if (result.failed > 0) {
        packageLogger.error("auth.account_deletion.billing_partial", { userId: user.id, ...result });
      }
    },
  },
});
```

### 4.2 Rotas operacionais

```ts
// app/api/webhooks/stripe/route.ts
import { STRIPE_SIGNATURE_HEADER, WebhookSignatureError } from "@informach/billing";
import { billing } from "@/lib/billing";

export const runtime = "nodejs"; // Stripe signature exige Node crypto

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get(STRIPE_SIGNATURE_HEADER);
  let event;
  try {
    event = billing.verifyWebhookSignature(raw, sig);
  } catch (err) {
    if (err instanceof WebhookSignatureError) return new Response("Invalid signature", { status: 400 });
    throw err;
  }
  try {
    const result = await billing.handleStripeEvent(event);
    return Response.json({ ok: true, ...result });
  } catch {
    return new Response("Handler error", { status: 500 }); // Stripe retenta
  }
}
```

```ts
// app/api/jobs/billing-reconcile/route.ts (e os outros 4 sweepers)
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  return Response.json(await billing.reconcileSubscriptions());
}
```

A **dunning route** é especial: o app monta sua própria função `send` que resolve email do subject, renderiza `billing.payment-failed` e chama `emails.sendEmail`. Ver `apps/agenda-da-turma/src/app/api/jobs/billing-dunning/route.ts` como referência.

### 4.3 `proxy.ts` — whitelist `/api/webhooks` e `/api/jobs`

Defensivo: ambas rotas autenticam por mecanismo próprio (signature/Bearer). Whitelist em `publicPaths` evita que um futuro `requireAuth: ["/"]` quebre webhooks/crons.

### 4.4 Env vars consumidas

| Var | Uso |
|---|---|
| `STRIPE_SECRET_KEY` | `stripeSecretKey` (formato `sk_test_...` ou `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | `stripeWebhookSecret` (formato `whsec_...`) |
| `STRIPE_PUBLISHABLE_KEY` | (opcional, só se usar Stripe Elements no client) |
| `STRIPE_MODE` | (opcional) `dev`/`prod` override; default infere de `NODE_ENV` |
| `CRON_SECRET` | proteção dos cron jobs (lida pelo app, não pelo package) |
| `NEXT_PUBLIC_APP_URL` | base para success/cancel/portal/manage URLs |
| `DATABASE_URL` | usado por `@informach/db` (compartilhado) |

### 4.5 Padrão de uso em server actions / RSC

```ts
// apps/<app>/src/app/(app)/admin/billing/actions.ts
"use server";
import { action, ok } from "@/lib/action";
import { billing } from "@/lib/billing";
import { z } from "zod";

export const startSubscriptionCheckout = action
  .input(z.object({ productId: z.string(), orgId: z.string() }))
  .auth({ require: "role", role: "owner", permission: "billing.manage" })
  .run(async ({ input, ctx }) => {
    const result = await billing.createSubscriptionCheckout({
      subject: { type: "organization", id: input.orgId },
      actorId: ctx.actor?.id ?? null,
      productId: input.productId,
      successUrl: `${env.NEXT_PUBLIC_APP_URL}/admin/billing?success=1`,
      cancelUrl: `${env.NEXT_PUBLIC_APP_URL}/admin/billing?canceled=1`,
    });
    return ok({ url: result.url });
  });
```

Server side, simples: `const balance = await billing.getBalance({ type: "user", id: user.id })` em qualquer RSC.

---

## 5. Arquitetura e design

### 5.1 Decisões fixadas (com justificativa)

1. **Schema Postgres separado `billing` (não `core`).** Why: retenção fiscal divergente — billing rows precisam ficar 5+ anos por NF-e mesmo após delete LGPD do user; emails/sessions podem ser purgados. Schema isolado deixa essa política óbvia, permite `pg_dump` separado p/ backups fiscais, RLS específico em prod. Precedente do repo: `audit` e `ai` também são schemas dedicados.

2. **Multi-provider abstraction (`stripe | asaas`).** Why: Asaas é relevante no Brasil (Pix/Boleto). Custo da abstração é uma interface (`BillingProviderClient`); ganho é não refatorar call-sites quando segundo provider entrar. Stripe é primeira implementação.

3. **Stripe API version PIN explícito** (`'2026-04-22.dahlia'` em `providers/stripe.ts`) matches `Stripe.LatestApiVersion` do `stripe@22.1.0` instalado. NUNCA usar `as any` para suprimir mismatch — TypeScript reclamando é o sinal certo de que SDK foi bumpado e payload changed (Basil moveu `current_period_*` para items.data[i] — bug silencioso se não atento).

4. **Owner do billing por app** — `agenda-da-turma` (orgs habilitadas) sempre usa `subject.type: "organization"`; `cozya` (sem orgs) sempre `"user"`. Schema usa `subjectType` + `subjectId` polimórfico (sem FK), check constraint força enum. Service rejeita `organization` quando `organizationsEnabled: false`. Decisão consciente do usuário: dimensão única por app simplifica drasticamente UI/lookup/permissions.

5. **Padrão reserve+commit/release para débito de IA.** Why: usuário escolheu para evitar race entre 2 chamadas LLM concorrentes. Padrão PaymentIntent-style — atomicidade via `pg_advisory_xact_lock(hashtext("user:abc"))` por owner + ledger append-only. Saldo sempre derivado de SUM, nunca cached em row mutável (evita drift).

6. **Bônus mensal com expiração no ciclo (não acumula).** Subscriber recebe X créditos/mês via webhook `invoice.paid`, expiram em 31d. Sweeper diário `expireMonthlyBonusCredits` insere entries `expiration` negativas para histórico/auditoria (anti-join via `NOT EXISTS`); saldo ativo exclui essas entries porque os positivos vencidos já saem pelo filtro `expires_at`.

7. **Créditos comprados pontualmente NUNCA expiram** (`expires_at: null`). UX simples; liability fiscal aceito em early stage.

8. **Idempotência em 3 camadas** — `webhookEvents` UNIQUE + claim de processamento, `oneTimePayments/subscriptions.providerId` UNIQUE e `creditLedger.stripeEventId` UNIQUE parcial. Mesmo Stripe replay concorrente não duplica grant.

9. **Stripe é source of truth.** Operações locais chamam Stripe primeiro; UPDATE local otimista só acontece quando o estado provider já é seguro. Em `switchPlan(immediate)`, invoice aberta mantém o plano local antigo até pagamento/webhook. Webhook reconcilia. `reconcileSubscriptionStatuses` cron diário recupera webhook perdido.

10. **Email integration opt-in** via `config.{sendEmail, renderTemplate, manageBillingUrl, buildUnsubscribeUrl, unsubscribeMailto}`. Quando ausentes, helpers viram no-op com debug log. Webhook ack NUNCA falha por email outage — `sendBillingEmail` swallowa erros (`render_failed`/`send_failed`).

11. **Audit hook fire-and-forget.** `config.onAudit` é callback síncrono que apps wireiam para `logAuditEvent`. Falha em audit nunca bloqueia billing — pattern try/catch'ed dentro dos handlers.

12. **Sweepers expostos como métodos da BillingService**, não require que apps montem `providerClient` por conta própria. Cron route fica trivial: `await billing.reconcileSubscriptions()`.

13. **`runtime: "nodejs"` obrigatório no webhook route.** Stripe signature usa Node crypto, falha em Edge runtime.

14. **Pro entitlement = `["active", "trialing"]`, definido uma única vez em `access.ts`.** Trialing entra (concessão explícita do produto); past_due NÃO (dinheiro não entrou). A regra muda só editando `PRO_STATUSES`. Features novas chamam `hasProSubscription` — nunca inline status check.

15. **Drip mensal no plano anual (não 12× upfront).** Anual cobra 1×/ano mas o sweeper diário concede 100 créditos a cada 30d em quem está `active`/`trialing`. A primeira leva entra no `subscription_create` (junto com seed do anchor); as renovações anuais (`subscription_cycle`) só resetam o anchor — não re-grant. O sweeper para antes de gerar um batch cujo próximo anchor cairia fora do período pago, evitando o 13º grant. `subscription_update` (mid-cycle change) é IGNORADO pelo invoice handler.

16. **`priceId` é fonte da verdade sobre `metadata.product_id`.** Stripe metadata é setado uma vez e não migra em swap de price (`subscriptions.update`). Resolver pelo priceId catálogo evita state divergente após upgrade. Drift é logado.

17. **Single-subscription invariant.** `createSubscriptionCheckout` rejeita com `AlreadySubscribedError` se já existe sub `active`/`trialing`/`past_due` — apps roteiam para `switchPlan`. Evita o caso "double-click cria 2 paid subs paralelas" e mantém o modelo single-sub-per-subject que a UI espera.

18. **Pending plan intent (downgrade scheduling).** `switchPlan(mode='schedule_at_period_end')` grava `pending_product_id`/`pending_price_id` no row local + `cancel_at_period_end=true`. O webhook `subscription.deleted` aplica a intent: cria a nova sub via `provider.createSubscription` reusando o customer + default payment method. Falha (cartão expirado) grava `metadata.pendingPlanError` e clear pending; não retenta automaticamente.

19. **Idempotency key determinístico em janela curta.** Se caller não passa `idempotencyNonce`, o helper deriva `auto:${floor(now/300_000)}` — 5min por janela. Cobre double-click/refresh sem virar lock permanente entre sessões. Stripe TTL idempotency = 24h.

20. **`Product.listPrice` é display-only; Stripe é source-of-truth de cobrança.** UI (cards, plan picker) renderiza a partir de `Product.listPrice.amountCents` para responder "quanto vou pagar?" antes do checkout. **Mismatch entre `listPrice` e Stripe Price é bug** — atualizar os dois lados juntos. Não derivar UI a partir de chamada Stripe (lento, sem cache, opaco em build).

### 5.5 Modelo econômico Cozya

Cozya consome este package em modo **single-user** (`subject.type: "user"`, `organizationsEnabled: false`) e segue um modelo econômico fixo, validado com a usuária:

| Item | Valor |
|---|---|
| Pro mensal | R$ 14,90/mês (`cozya_pro_monthly`, `bonusCreditsPerMonth: 30`) |
| Pro anual | R$ 149/ano (`cozya_pro_annual`, drip mensal de 30) |
| Regra de débito | **1 chamada à API de IA = 1 crédito** (`flatCost: 1` em `creditPricing`) |
| Modelo default texto/URL/geração/refino | `openai/gpt-4o-mini` via OpenRouter |
| Modelo default vision (foto) | `openai/gpt-4o` via OpenRouter (`imageDetail: 'low'` no caller) |
| Modelo de transcrição | `openai/whisper-1` via OpenRouter (`/audio/transcriptions` OpenAI-compatible) |
| Gateway de IA | OpenRouter único (`OPENROUTER_API_KEY`); ~5% markup sobre custo OpenAI direto, margem cozya continua >95% |
| Free | sem IA — gate em `hasProSubscription` |
| Rate limit | 10 chamadas/hora por user (defesa anti-script no app cozya) |

**Por que cobrar por chamada e não por cadastro salvo:** se o débito acontecesse só ao salvar, usuário podia gerar/refinar várias vezes sem salvar — cada chamada paga upstream sem cobrar nada do usuário. `withCredits` reserva ANTES da chamada, commita SE ok, libera SE falha. Custo upstream sempre coberto.

**Pacotes extras** (Pro-only via `getProSubscription` gate em `createCreditPackCheckout`): premium de 20-40% per-credit sobre o plano (R$ 0,497/crédito). Sinaliza "assinatura é o melhor valor". Volume cap em 30 (= 1 mês completo) — não vendemos volumes maiores que o cap mensal.

| Pack | Créditos | Preço | R$/crédito | Premium vs plano |
|---|---|---|---|---|
| `cozya_credits_10` | 10 | R$ 6,90 | R$ 0,69 | +39% |
| `cozya_credits_20` | 20 | R$ 12,90 | R$ 0,645 | +30% |
| `cozya_credits_30` | 30 | R$ 17,90 | R$ 0,597 | +20% |

**Seed de pricing:** `pnpm db:seed` primeiro invoca `expireLegacyCozyaPricing` (fecha rows com IDs antigos não-prefixados — `gpt-4o`, `gpt-4o-mini`, `whisper-1` — restantes da era pré-OpenRouter), depois `seedCozyaCreditPricing` (`packages/billing/src/seeds/credit-pricing.ts`) com 7 features OpenRouter-prefixed: 1 vision (`openai/gpt-4o`) + 5 mini (`openai/gpt-4o-mini`) + 1 whisper (`openai/whisper-1`). Idempotente em ambos os passos — só insere quando não há row ativa para `(feature, model)` e só fecha legacy quando a row ainda está ativa. Para trocar modelo no futuro: insira nova row + set `effective_to = now()` na antiga (mesmo padrão).

**Custo unitário esperado** (mix realista): ~R$ 0,02/chamada → 30 créditos = ~R$ 0,60 custo IA por user/mês → margem bruta ~96%. Pós-beta, comparar `SUM(usage_logs.tokens × custo_modelo)` vs receita por user e ajustar se margem < 90%.

Detalhes operacionais em `apps/cozya/CLAUDE.md` §2-7.

### 5.2 Sub-paths exportados (`exports` em `package.json`)

| Sub-path | Conteúdo | Quem importa |
|---|---|---|
| `@informach/billing` | `createBillingService`, `BillingService`, types, errors, `STRIPE_SIGNATURE_HEADER` | `apps/<app>/src/lib/billing.ts`, server actions, RSC |
| `@informach/billing/checkout` | `createSubscriptionCheckout`, `createCreditPackCheckout` (raw) | raramente — service já expõe |
| `@informach/billing/credits` | `getBalance`, `reserveCredits`, `commitReservation`, `releaseReservation`, `consumeCredits`, `getCreditHistory`, `grantBonusCredits`, `refundCredits` (raw) | `@informach/ai-core/billing` (wrapper) |
| `@informach/billing/portal` | `createPortalSession` (raw) | raramente |
| `@informach/billing/seeds` | `seedCozyaCreditPricing`, `COZYA_PRICING_SEED` — wired no script `pnpm db:seed` (delega para `pnpm --filter @informach/billing seed`) | `packages/billing/scripts/seed.ts`, futuras admin routes |
| `@informach/billing/subscriptions` | `getSubscription`, `listSubscriptions`, etc (raw) | raramente |
| `@informach/billing/sweepers` | `reconcileSubscriptionStatuses`, `expireMonthlyBonusCredits`, `grantPendingMonthlyBonusCredits`, `releaseExpiredReservations`, `retryFailedDunningEmails` (raw) | apps que querem chamar diretamente sem passar pela service |
| `@informach/billing/webhooks` | `verifyStripeSignature`, `handleStripeEvent`, types | apps' `webhooks/stripe/route.ts` |

Para a maioria dos call-sites, importar de `@informach/billing` raiz é suficiente — a `BillingService` factory já agrega tudo.

### 5.3 Tipos exportados

`SubjectRef`, `SubjectType`, `CreditOwner` (alias de SubjectRef), `BillingProvider`, `Product` (re-exportado de `@informach/config`), `SubscriptionStatus`, `PaymentStatus`, `LedgerEntryType`, `ReservationStatus`, `CreditBalance`, `ReservationHandle`, `BillingAuditEvent`, `BillingAuditEventType`, `CheckoutResult`, `*CheckoutInput`, `PortalSessionInput`, `BillingService`, `BillingServiceConfig`.

Plan changes (`./plan-changes`): `PlanChangeMode`, `SwitchPlanInput`, `SwitchPlanResult`, `ReactivateSubscriptionInput`, `PreviewPlanChangeInput`, `PreviewPlanChangeResult`.

Sweepers (`./sweepers`): `ReconcileSubscriptionsResult`, `ExpireMonthlyBonusResult`, `GrantMonthlyBonusResult`, `ReleaseExpiredReservationsResult`, `RetryDunningEmailsResult`, `DunningPayload`, `DunningSendFn`.

Access (`./access`): `PRO_STATUSES` (constante), `getProSubscription`, `hasProSubscription` (funções raw — `BillingService.hasProSubscription` é o caminho preferido).

Todos os errors: `BillingError`, `NotImplementedError`, `InvalidProductError`, `WebhookSignatureError`, `InsufficientCreditsError`, `ReservationNotFoundError`, `ReservationExpiredError`, `ReservationAlreadyResolvedError`, `OrganizationsDisabledError`, `CustomerNotFoundError`, `AlreadySubscribedError`, `SubscriptionRequiredError`.

### 5.4 Deps relevantes

- **`stripe@^22.1.0`** (PIN literal `'2026-04-22.dahlia'`) — bumpar major exige re-validar literal e re-testar handlers contra novo payload shape
- **`drizzle-orm@^0.45.2`** — para SELECT/INSERT/UPDATE typed + `db.execute(sql\`...\`)` para advisory lock e raw SQL de balance
- **`@informach/db`** — schema source of truth e Drizzle client
- **`@informach/auth`** — `logAuditEvent` (apps wireiam) + `AuditEventType` (inclui os 9 `billing.*`)
- **`@informach/emails`** — `SendEmail`, `RenderTemplate`, `EmailCategory` (estendido com 5 `billing.*`); `buildUnsubscribeToken` para apps construírem o builder
- **`@informach/config`** — `Product`, `PRODUCTS`, `getStripePriceId`, `findProductByPriceId`

---

## 6. Testes

164 tests em `src/__tests__/` rodando via `pnpm --filter @informach/billing test` (todos com vitest + fakes em vez de Postgres real):

| Arquivo | Cobertura |
|---|---|
| `access.test.ts` | `PRO_STATUSES` shape; `getProSubscription` retorna row para active/trialing, null para past_due/unpaid/incomplete/canceled/paused; `hasProSubscription` boolean. |
| `customers.test.ts` | getOrCreateCustomer: existing, new, race resolution, OrganizationsDisabled |
| `factory.test.ts` | createBillingService: missing secrets, unknown provider, injected client, webhook delegation |
| `checkout.test.ts` | sub/credit-pack happy paths, wrong kind, missing product, stripeMode prod, `AlreadySubscribedError` em subscription, **`SubscriptionRequiredError` em credit pack para Free user**. |
| `subscriptions.test.ts` | get/list, cancel default+immediate, update, cancelBillingForSubject (LGPD partial fail) |
| `plan-changes.test.ts` | switchPlan immediate (anchor anual seedado, cobrança imediata), schedule_at_period_end (pending_* setado), reactivateSubscription (clear cancel/pending), previewPlanChange (subtotal+credit+amountDue), `paymentActionUrl` quando invoice fica unpaid. |
| `portal.test.ts` | sucesso, customer not found, OrgsDisabled |
| `webhooks.test.ts` | dispatcher: dedup processed/in-progress, retry erro/stale, subscription event, ignored event, checkout.session log |
| `webhooks-payment.test.ts` | credit pack: fresh grant, replay (parcial/total), invalid metadata, customer not found |
| `webhooks-invoice.test.ts` | invoice.paid: fresh, replay, non-cycle skip, no bonus, recovery priceId-first, missing local; payment_failed |
| `webhooks-invoice-annual.test.ts` | annual `subscription_create` → grant + anchor; `subscription_cycle` → anchor reset (sem grant); `subscription_update` → short-circuit `non_cycle`; race guard (priceId override sobre stale productId). |
| `webhooks-subscription-pending.test.ts` | `subscription.deleted` aplica `pending_product_id` (cria nova sub via provider); falha de cartão grava `metadata.pendingPlanError` + clear pending; sem pending não faz nada. |
| `webhooks-subscription-product-drift.test.ts` | priceId-first resolution: anual com metadata stale (`product_id="cozya_pro_monthly"`) grava productId correto pelo price; fallback para metadata quando priceId desconhecido. |
| `credits-balance.test.ts` | zero, total/reserved/available, bigint coerce, ISO timestamps |
| `credits-history.test.ts` | empty, paginated, cursor encode/decode, invalid cursor swallowed |
| `credits-grant.test.ts` | grantBonus fresh+replay+broken invariant; refund fresh+replay+positive→negative |
| `credits-reservations.test.ts` | reserve+commit+release+consume; insufficient; reservation expired; TOCTOU |
| `sweepers.test.ts` | expireMonthlyBonus; releaseExpiredReservations; dunning (send+dry-run+throttle+error swallow) |
| `sweepers-drip.test.ts` | grantPendingMonthlyBonusCredits: anchor advance 30d, idempotência via stripeEventId, stop quando next drip > cancel_at_period_end/current_period_end, skip non-annual. |
| `sweepers-reconcile.test.ts` | aligned (no-op); status drift; deleted in Stripe; cancel scheduled; per-row error |
| `billing-emails.test.ts` | sendBillingEmail: 4 categorias happy + 4 graceful fails + identifier=email default |

`_fake-db.ts` — mock Drizzle satisfazendo todo o chain (.select/.insert/.update/.delete/.execute/.transaction + .innerJoin/.leftJoin/.from/.where/.set/.values/.returning/.limit/.onConflict*).

`_fake-provider.ts` — mock `BillingProviderClient` injetável via `config.providerClient` (evita instanciar Stripe SDK em tests).

Para integração real → Stripe CLI test mode + Playwright nos apps em `mode: EMAIL_SANDBOX_MODE=memory`.

---

## 7. Regras para agentes

1. **NUNCA chutar `apiVersion` do Stripe.** Validar SEMPRE com `cat node_modules/.pnpm/stripe@*/node_modules/stripe/esm/apiVersion.d.ts` ou consultar context7. NUNCA usar `as any` para suprimir literal mismatch — é o sinal de que payload shape mudou (Basil moveu `current_period_*` para items.data[i]; Dahlia tem outras mudanças).

2. **Ao bumpar `stripe-node` major:** verificar literal `apiVersion`, re-rodar tests, ler migration guide do release no GitHub wiki, atualizar este doc + `stripe_api_basil_changes.md` na memory.

3. **Schema novo em `billing.*`?** Editar `packages/db/src/schema/billing.ts`, gerar migration via `pnpm db:generate`, validar `pnpm db:migrate`. NUNCA modificar tabelas existentes não-aditivamente sem decisão consciente — billing é fiscal/regulado.

4. **Adicionar nova `EmailCategory billing.*`?** (a) `EMAIL_CATEGORIES` em `@informach/emails/schemas.ts`. (b) `EmailCategory` union em `@informach/emails/dispatch.ts` E `templates/index.ts`. (c) Componente React Email em `templates/<name>.tsx`. (d) Mapear em `CATEGORY_REGISTRY`. (e) Strings PT-BR em `messages/pt-BR.json`. (f) `EmailNamespace` em `i18n.ts`. (g) Atualizar `BillingEmailCategory` aqui se vier de webhook handler. (h) Atualizar §3.8 deste doc.

5. **Audit/email/logger emit-points devem ser try/catch'ed.** Webhook ack ≠ business correctness no integrador externo. Falha em audit/email/logger NUNCA pode bloquear webhook ack — Stripe não retenta por erro nosso, retenta por 5xx do nosso lado.

6. **Idempotência sempre em 3 camadas.** Adicionou novo handler? Pense: (a) `webhook_events` UNIQUE já cobre dispatch dedup; (b) sua tabela de side effect tem UNIQUE constraint própria? (c) `stripeEventId` no ledger ou equivalente?

7. **Owner é polimórfico (subjectType + subjectId).** NUNCA adicionar FK direto para `users.id` ou `organizations.id` no schema billing — quebra LGPD soft-delete + tira flexibilidade multi-tenant. Use o tipo `SubjectRef = { type: "user" | "organization", id: string }`.

8. **Reservation pattern é OBRIGATÓRIO em chamadas LLM via ai-core.** Nunca fazer "consume após callLLM" sem reserve antes — race entre 2 chamadas concorrentes vira saldo negativo. Use `withCredits` de `@informach/ai-core/billing` que orquestra tudo.

9. **`config.onAudit` é o ponto de extensão para audit, NÃO chamar `logAuditEvent` direto dos handlers.** Mantém o package desacoplado do auth — apps decidem como persistir.

10. **`Stripe.Decimal` para campos monetários (v21+).** Quando tocar invoices/refunds/charges com `unit_amount_decimal`/`fx_rate`/`quantity_decimal`, usar `Stripe.Decimal.from('9.99')` em request e `value.toString()` em response — não tratar como string cru.

11. **Tipo `Tx` em transactions.** `db.transaction((tx) => ...)` callback recebe `PgTransaction<...>` que NÃO tem `$client`. Cast `as Database` falha. Usar `type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]` para helpers que rodam em ambos.

12. **Webhook route precisa `runtime = "nodejs"`.** Edge runtime não suporta o `crypto` que `stripe.webhooks.constructEvent` usa.

13. **Adicionar novo provider (Asaas)?** (a) Implementar `BillingProviderClient` em `providers/asaas.ts`. (b) Adicionar `"asaas"` ao `BillingProvider` union (já está). (c) `buildProviderClient` em `index.ts` ramifica por `config.provider`. (d) Tests com fake provider. (e) Webhook handlers podem precisar abstrair shape de payload (Asaas envia formato diferente — talvez camada de normalization no `verifyWebhookSignature`).

14. **Mudanças nos audit event types `billing.*`** exigem atualização em `@informach/auth/src/audit.ts` (union estrita) + tabela em `@informach/auth/CLAUDE.md` §3.5 + revisão da política de payload em `docs/audit-payload-policy.md`.

15. **Feature gate Pro? Sempre `hasProSubscription`.** Nunca inline `subscription.status === "active"` ou `inArray(status, [...])` — a regra muda (vide §3.11), e o helper centraliza. Ele já cobre o grace period pós-cancel-at-period-end e exclui past_due automaticamente.

16. **Webhook handler resolvendo `productId`?** Sempre via `priceId` no catálogo (`stripePriceId.{dev,prod}` match), nunca diretamente via `subscription.metadata.product_id`. Stripe metadata fica stale após `subscriptions.update` swap de price. Quando os dois divergem, logar warn `metadata_product_drift`.

17. **Adicionar `bonusCreditsPerMonth` a um plano anual?** Garantir o flow drip: (a) `next_credit_grant_at` é anchored em `subscription_create` (`now + 30d`); (b) `subscription_cycle` (renovação anual) só reseta o anchor — sem grant; (c) o sweeper não concede quando `anchor + 30d` cairia fora do período pago; (d) `subscription_update` (mid-cycle) é IGNORADO pelo invoice handler. NUNCA grant 12× upfront — isso quebra a expectativa "saldo do mês expira ao fim do mês".

18. **Adicionar nova feature gate Pro-only?** (a) Adicionar checkpoint via `billing.hasProSubscription(subject)` ou `getProSubscription(...)`. (b) Lançar `SubscriptionRequiredError("nome-da-feature")` no backend. (c) Esconder a UI quando não-Pro (RSC com Suspense). (d) Defesa em profundidade: client tratar code de erro com mensagem clara ("Disponível só para assinantes Pro").

---

## 8. Próximos passos potenciais (fora do escopo atual)

Já entregues recentemente (não estão mais aqui): UI `/settings/billing` no Cozya com plan card + switch dialog + cancel/reactivate + credit packs Pro-only; helpers `switchPlan`/`reactivateSubscription`/`previewPlanChange`; drip mensal anual via sweeper diário; `hasProSubscription` como single source of truth.

Pendências:

- **UI `/admin/billing` no agenda-da-turma** — backend está 100% pronto e o catálogo cozya foi feito; replicar plan card / switch dialog / credit packs com subject = `organization`.
- **Admin UI para `creditPricing`** — atualizar preços per-feature/per-model sem deploy. Hoje é só seed inicial.
- **Asaas provider** — adicionar Pix/Boleto via segunda implementação de `BillingProviderClient`.
- **Métricas/alertas avançados** — o logger básico já duplica `warn`/`error` para Sentry no adapter do app; para métricas, spans ou dashboards, usar `onAudit` como ponto de extensão para Datadog/OTel/Sentry.
- **Multi-currency** — hoje hardcoded BRL, expandir quando produto pedir.
- **Usage-based billing** — Stripe metered billing para subscriptions com tier baseado em consumo (alternativa ao credit pack model).
- **Dashboard de receita/MRR** — view materializada agregando `subscriptions.status` + `oneTimePayments.amount_cents` por dia/mês.
- **Subscription tiers que liberam features** — hoje `bonusCreditsPerMonth` é o único benefício; expandir para feature flags via `tier` no Product. `hasProSubscription` já está pronto para receber `tier?` opcional como segundo parâmetro.
- **Refunds via UI** — hoje só programático. Admin action que dispara `refundCredits` + Stripe refund correspondente.
- **Atualizar `subscription.metadata.product_id` no Stripe pós-`switchPlan(immediate)`** — hoje o package usa priceId como autoridade (ver §5.1 #16), mas atualizar metadata via `stripe.subscriptions.update({ metadata })` deixaria o estado externo limpo também. Hygiene, não correção.

Para retomar trabalho de fase, perguntar ao usuário qual fase está autorizada — cada fase é entregável independente. Histórico de fases entregues vive na memory (`billing_architecture.md`).
