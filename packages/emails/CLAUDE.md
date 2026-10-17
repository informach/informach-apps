# `@informach/emails` — package guide

> Documentação primária do package para humanos e agentes. Para checklist visual de templates ver [`EMAILS.md`](./EMAILS.md). Para deploy/cron/Domain Auth/Webhook setup ver [`PRODUCTION.md`](./PRODUCTION.md). Para integração com auth ver [`@informach/auth/CLAUDE.md`](../auth/CLAUDE.md).

---

## 1. Propósito

`@informach/emails` é o pipeline de **transactional email** dos apps Next.js do monorepo `informach-platform`. Encapsula:

- Despacho idempotente com claim atômico, retry inline polinomial e classificação permanent/transient (padrão Akita do "segundo cérebro").
- Templates como componentes React Email (paridade HTML/text automática, infraestrutura i18n).
- Integração com SendGrid via `@sendgrid/mail` v8 (apenas provider hoje).
- Webhook Signed Event para recebimento de eventos (`delivered`, `bounce`, `dropped`, `spamreport`, `unsubscribe`).
- Sweepers (cron-friendly) para recuperação de `sending` stale, retry de `failed` e sincronização de suppressions.
- Tokens HMAC RFC 8058 + One-Click para `List-Unsubscribe` headers.

O package **não** lê env vars próprias, **não** decide UI, **não** expõe rotas — cada app é responsável por:

1. Validar env (`SENDGRID_API_KEY`, `SENDGRID_FROM`, `EMAIL_SANDBOX_MODE`, etc.) com Zod.
2. Instanciar via `createEmailService(config)` em `apps/<app>/src/lib/emails.ts`.
3. Injetar `emails.sendEmail` e `emails.renderTemplate` no `createAuth({...})` (e em outros call-sites futuros).
4. Expor as 5 rotas operacionais: webhook SendGrid, unsubscribe, e os 3 cron jobs.

---

## 2. Como funciona (diagrama mental)

```
apps/<app>/src/lib/
  ├── env.ts               ← Zod-validated env vars (SENDGRID_*, EMAIL_SANDBOX_*)
  ├── emails.ts            ← createEmailService({ apiKey, defaultFrom, db, mode, onAudit, ... })
  ├── observability.ts     ← packageLogger/authObservability app-level
  └── auth.ts              ← createAuth({ sendEmail, renderTemplate, buildUnsubscribeUrl, ... })

apps/<app>/src/app/api/
  ├── webhooks/sendgrid/route.ts        ← verifySendgridSignature + handleSendgridEvents
  ├── email/unsubscribe/route.ts        ← verifyUnsubscribeToken + insert emailUnsubscribes
  └── jobs/
      ├── email-recover-stale/route.ts  ← recoverStaleDeliveries (a cada 30 min)
      ├── email-retry/route.ts          ← retryFailedDeliveries (a cada 5 min)
      └── email-suppression-sync/route.ts ← syncSendgridSuppressions (1×/dia)

@informach/emails source
  ├── index.ts             ← createEmailService factory + EmailDeliveryError + tipos
  ├── audit.ts             ← tipos `email.*`, hashing de email e emit best-effort
  ├── dispatch.ts          ← dispatchEmail (idempotency + claim + retry + sandbox)
  ├── retry.ts             ← MAX_ATTEMPTS, classifySendgridError, nextAttemptDelaySeconds
  ├── sweepers.ts          ← recoverStaleDeliveries, retryFailedDeliveries, syncSendgridSuppressions
  ├── webhook.ts           ← verifySendgridSignature, handleSendgridEvent(s)
  ├── list-unsubscribe.ts  ← buildUnsubscribeToken / verifyUnsubscribeToken (HMAC)
  ├── schemas.ts           ← Zod schemas (SendEmailInputSchema)
  ├── logger.ts            ← Logger type (debug?/info?/warn?/error?)
  └── templates/
      ├── index.ts         ← renderTemplate(category, props) → { html, text, subject }
      ├── i18n.ts          ← createTranslator wrapper (default pt-BR)
      ├── EmailLayout.tsx  ← componente base (preheader oculto + footer com unsubscribe)
      ├── verification.tsx
      ├── passwordReset.tsx
      ├── magicLink.tsx
      ├── invitation.tsx
      └── accountDeletion.tsx
```

### Tabelas usadas (schema em `packages/db/src/schema/core.ts`)

- `core.email_deliveries` — track per-recipient/per-messageKey de cada envio. Colunas-chave:
  - `category`+`messageKey` UNIQUE (idempotência).
  - `status`: `pending → sending → sent | failed | delivered | bounced | dropped | complained | unknown`.
  - `subject`/`html`/`text` — corpo persistido para retries (Fase 5).
  - `sendAttempts` — guardado contra `MAX_ATTEMPTS` (8) em retries.
  - `providerMessageId` — `x-message-id` retornado pelo SendGrid; usado pelo webhook.
  - `customArgs.delivery_id` espelha `id` para correlacionar webhook→row.

- `core.email_suppressions` — emails permanentemente impedidos de receber (bounce/block/spamreport/invalid). Sync diário do `/v3/suppression/*` do SendGrid + upsert no caminho do webhook.

- `core.email_unsubscribes` — `(userId, category)` PK; populado por (a) clique no link `/api/email/unsubscribe`, (b) header `List-Unsubscribe-Post: One-Click`, (c) evento `unsubscribe`/`group_unsubscribe` do webhook.

---

## 3. Funcionalidades

### 3.1 `createEmailService(config)` — entrypoint principal
Retorna `{ sendEmail, renderTemplate, getOutbox?, clearOutbox? }`.

| Config | Tipo | Default | Notas |
|---|---|---|---|
| `apiKey` | `string` | — | Obrigatório quando `mode='live'`. Ignorado em sandbox/memory. |
| `defaultFrom` | `string` (email) | — | Remetente fallback (usado quando `input.from` ausente). Domínio precisa estar autenticado no SendGrid (DKIM). |
| `db` | `Database` | — | Drizzle de `@informach/db`. Compartilhado com auth. |
| `mode` | `"live" \| "sandbox" \| "memory"` | `"live"` | Ver §3.6. |
| `sandboxDir` | `string` | `"./tmp/integration_emails"` | Só para `mode='sandbox'`. |
| `logger` | `Logger` | no-op | Ver §3.7. |
| `onAudit` | `(event) => void \| Promise<void>` | — | Hook opcional para app persistir `email.*` via `@informach/auth.logAuditEvent`. Best-effort; não quebra envio/webhook. |

### 3.2 `sendEmail(input)` — despacho idempotente
Fluxo (linhas em `dispatch.ts`):

1. **Validate** — `SendEmailInputSchema.parse(input)` (Zod). Erros viram `EmailDeliveryError` com `cause`.
2. **Insert idempotente** — `INSERT ... ON CONFLICT (category, message_key) DO NOTHING RETURNING *`. Se a row já existe e está `sent` ou `delivered`, retorna `{ ok: true, status: 'already-sent' }`.
3. **Claim atômico** — `UPDATE WHERE id=? AND status IN ('pending', 'failed') SET status='sending', sendAttempts += 1`. Se 0 rows tocadas: retorna `{ ok: false, status: 'deferred', reason: 'in-flight' }`. Registros `sending` e `unknown` também retornam `deferred`; `unknown` usa `reason: 'outcome-unknown'` e exige reconciliação, sem reenvio automático. `skipped` fica reservado a bloqueios definitivos.
4. **Sandbox** (`mode='sandbox'`) — escreve `<sandboxDir>/<id>.json` (meta) e `<id>.html` (body). Marca `status='sent'`.
5. **Memory** (`mode='memory'`) — mete `{ id, to, subject, html, text, headers, customArgs }` em outbox em-memória. Marca `status='sent'`.
6. **Live** — chama `sgMail.send(msg)` com `headers: List-Unsubscribe + List-Unsubscribe-Post: One-Click`, `customArgs: { delivery_id, category, user_id }`, `categories: [input.category]`.
7. **Retry** — em erro `transient` (408/425/429/5xx): backoff polinomial `attempt^4 + 2s ±15%` (de `retry.ts:11`), até `inlineRetryAttempts` (default 3). Em erro `permanent` (400/401/403/413): aborta no primeiro fail.
8. Em sucesso: `status='sent'`, `providerMessageId = headers['x-message-id']`, audit `email.delivery_sent`.
9. Em falha após retries: `status='failed'`, `lastError` populado, audit `email.delivery_failed` e log `error` ao esgotar as tentativas inline. `retryFailedDeliveries` reativa apenas as categorias com corpo persistido e autorizadas para retry genérico. Corpos `auth.*` nunca são persistidos: o responsável precisa solicitar novo código/link depois de resolvida a falha. A resposta pública de auth preserva a proteção contra enumeração de contas; o alerta operacional não inclui destinatário, OTP ou corpo.
10. Bloqueios por suppression/unsubscribe emitem `email.delivery_skipped`. Descadastro não bloqueia `auth.*` nem `admin.alert` (`shouldRespectUnsubscribe`).

### 3.3 `renderTemplate(category, props, opts?)` — renderização de templates
Mapeamento `EmailCategory → componente React Email`:

| Categoria | Componente | Props específicos |
|---|---|---|
| `auth.verify-email` | `VerificationEmail` | `appName, url` |
| `auth.verify-email-otp` | `VerifyEmailOtp` | `appName, otp, expiresInMinutes` |
| `auth.sign-in-otp` | `SignInEmailOtp` | `appName, otp, expiresInMinutes` |
| `auth.forget-password-otp` | `ForgetPasswordEmailOtp` | `appName, otp, expiresInMinutes` |
| `auth.password-reset` | `PasswordResetEmail` | `appName, url` |
| `auth.magic-link` | `MagicLinkEmail` | `appName, url` |
| `auth.invitation` | `InvitationEmail` | `appName, inviterName, organizationName, url` |
| `auth.account-deletion` | `AccountDeletionEmail` | `appName, url` |
| `auth.signup-attempt-on-existing` | `SignupAttemptOnExistingEmail` | `appName, loginUrl` |
| `auth.two-factor-setup-otp` | `TwoFactorSetupEmailOtp` | `appName, otp, expiresInMinutes` (código que prova a caixa de e-mail antes de ativar as duas etapas, no Bastidores) |
| `billing.payment-success` | `PaymentSuccessEmail` | `appName, productName, amountFormatted, manageBillingUrl` |
| `billing.payment-failed` | `PaymentFailedEmail` | `appName, attempt, maxAttempts, updatePaymentUrl` |
| `billing.subscription-renewed` | `SubscriptionRenewedEmail` | `appName, productName, nextBillingDate, manageBillingUrl` |
| `billing.subscription-canceled` | `SubscriptionCanceledEmail` | `appName, productName, accessUntil, reactivateUrl` |
| `billing.credits-purchased` | `CreditsPurchasedEmail` | `appName, creditAmount, balanceAfter, dashboardUrl` |
| `billing.credits-warning` | `BillingCreditsWarningEmail` | `appName, remaining, total, threshold (50\|80\|100), ctaUrl` |
| `admin.alert` | `AdminAlertEmail` | `appName, kind (down\|up), serviceName, downSince, upAt?, duration?, problem?, ctaUrl` |
| `admin.weekly-summary` | `AdminWeeklySummaryEmail` | `appName, weekLabel, newAccounts, products[], revenueTotal, aiCost, failedRoutines[], outages[], ctaUrl` |

Todos aceitam `unsubscribeUrl?`, `unsubscribeMailto?`, `preheader?` e `locale?` (default `"pt-BR"`).

Retorna `{ html: string; text: string; subject: string }`. Internamente usa `render()` e `render(..., { plainText: true })` do `@react-email/render`.

**Categorias `billing.*`** são consumidas por `@informach/billing` (4 via webhook handlers — `payment-success` / `subscription-renewed` / `subscription-canceled` / `credits-purchased`) e pelo dunning sweeper das apps (`payment-failed`). `billing.credits-warning` é disparada por trigger app-side (sweeper diário ou pós-`commitReservation`) para notificar 50%/80%/100% do cap mensal — disparo é responsabilidade do app, package só fornece o template. Strings PT-BR vivem em `messages/pt-BR.json` sob namespaces `paymentSuccess`/`paymentFailed`/`subscriptionRenewed`/`subscriptionCanceled`/`creditsPurchased`/`billingCreditsWarning`. Ver `@informach/billing/CLAUDE.md` §3.8 para o ciclo completo.

**Categorias montadas pelo app, sem template do package.** `agenda.routine` e `missao.weekly-report` descrevem dados de uma criança e são montadas no próprio app, no momento do envio. Elas entram em `EMAIL_CATEGORIES` e na union de `dispatch.ts`, mas **não** no registro de templates nem no i18n — a checklist da regra 3 abaixo se aplica só às letras (a) e (b) para esse tipo de categoria. As duas também são excluídas de `shouldPersistBody`: persistir o corpo deixaria uma retentativa genérica reenviar uma leitura desatualizada sobre a criança.

**Categorias `admin.*`** são do Bastidores (`apps/admin`) e vão só para a equipe: o aviso de serviço fora do ar e de volta (`admin.alert`, rotina `admin-watch`) e o resumo da semana para as contas owner (`admin.weekly-summary`, rotina `admin-weekly`). O aviso de queda é operacional e não obedece ao descadastro, como os e-mails `auth.*` (`shouldRespectUnsubscribe` em `delivery-policy.ts`); o resumo da semana obedece. Supressão por bounce ou spam vale para todas as categorias. Os textos chegam já formatados pelo app e não levam nome, e-mail ou conteúdo de pessoa. O corpo não é persistido (`shouldPersistBody`): a própria rotina reconstrói a mensagem a partir do estado atual e reenvia com a mesma `messageKey`, enquanto uma retentativa genérica de outro app reenviaria um aviso vencido.

> **`EmailCategory` está declarado em DOIS lugares:** (a) como Zod enum em `schemas.ts:EMAIL_CATEGORIES`, usado por `dispatchEmail` validation; (b) como string union em `templates/index.ts`, usado por `renderTemplate`. Adicionar nova categoria exige atualizar AMBOS — TypeScript pega o segundo, mas o primeiro é runtime check do `dispatch`. Ver §7 regra 3.

### 3.4 Tabela de retry (de `retry.ts`)

| Status | Permanent? | Ação |
|---|---|---|
| 400 | sim | aborta, `status='failed'` |
| 401 / 403 | sim | aborta |
| 413 | sim | aborta |
| 408 / 425 / 429 | não | retry com backoff |
| 5xx | não | retry com backoff |
| (sem status) | não | retry (default seguro) |

Backoff sample (sem jitter): `3, 18, 83, 258, 627, 1298, 2403, 4098` segundos. `MAX_ATTEMPTS=8` é o limite global (após isso, `retryFailedDeliveries` para de tentar).

### 3.5 Webhook SendGrid (`./webhook` sub-path)

`verifySendgridSignature(publicKey, rawBody, signature, timestamp)` valida a assinatura ECDSA do payload. **Importante**: o app precisa preservar `rawBody` antes de fazer JSON.parse (ver `next-steps.txt`/`PRODUCTION.md` para wiring no Next 16).

`handleSendgridEvents(deps, events[])` itera com try/catch por evento (1 falha não derruba o batch). Eventos suportados:

| Event | Ação no DB | Audit |
|---|---|---|
| `processed` / `delivered` | marca `providerAccepted=true`. Não sobrescreve `status='sent'` para `delivered` (decisão atual — `sent` significa "aceito pelo SendGrid"; `delivered` agrega no provider, não no nosso state machine). | — |
| `deferred` | só log warn | — |
| `bounce` / `blocked` | `status='bounced'` + insere em `email_suppressions` | `email.suppression_recorded` |
| `dropped` | `status='dropped'` + insere em `email_suppressions` | `email.suppression_recorded` |
| `spamreport` | `status='complained'` + insere em `email_suppressions` | `email.suppression_recorded` |
| `unsubscribe` / `group_unsubscribe` | insere em `email_unsubscribes` (resolve `userId` via `event.user_id` ou lookup por email) | `email.unsubscribe_recorded` |
| `open` / `click` | desabilitar no painel SendGrid (não rastreamos — `next-steps.txt:14-17`) | — |

### 3.6 Modos de operação

| Mode | Quando | Comportamento |
|---|---|---|
| `live` | produção | chama SendGrid de verdade |
| `sandbox` | dev local | escreve em `<sandboxDir>/<id>.{json,html}`, nunca chama SendGrid. Inspecionar em browser. |
| `memory` | testes E2E (Playwright) | acumula em array em memória. `getOutbox()` retorna; `clearOutbox()` limpa entre testes. |

### 3.7 Logger

`Logger = { debug?(msg, ctx?), info?(msg, ctx?), warn?(msg, ctx?), error?(msg, ctx?) }`. Todos os métodos opcionais. Default: no-op. Apps devem passar `packageLogger` de `apps/<app>/src/lib/observability.ts`, que escreve no pino e duplica `warn`/`error` sanitizados para Sentry. Pontos que emitem:

- `dispatch.ts`: `error` em permanent fail e quando as tentativas inline de erro transitório se esgotam; `debug` nas tentativas intermediárias. O alerta de esgotamento contém somente ID da entrega, categoria, classificação e número de tentativas.
- `sweepers.ts`: `info` em rows tocadas; `error` em erro de fetch SendGrid.
- `webhook.ts`: `warn` em deferred; `error` em evento que falha de processar.

### 3.8 List-Unsubscribe (RFC 8058 + One-Click)

`buildUnsubscribeToken(secret, identifier, category)` produz token HMAC determinístico (sem expiração — RFC 8058 exige link estável). `verifyUnsubscribeToken(secret, token)` valida (timing-safe) e retorna `{ identifier, category }`.

Headers adicionados em todo `sendEmail` (mode live):
- `List-Unsubscribe: <https://app.example.com/api/email/unsubscribe?t=...>, <mailto:unsubscribe@app.example.com>`
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

App expõe `GET /api/email/unsubscribe?t=...` (browser) e `POST` (One-Click do Gmail/Apple Mail).

### 3.9 Sweepers (cron-friendly)

Todas idempotentes. Sem efeito colateral exceto banco. Retornam contagens.

| Função | Cadence sugerida | O que faz |
|---|---|---|
| `recoverStaleDeliveries({ db, staleAfterMs? })` | a cada 30 min | rows `status='sending'` há > 30 min → `status='unknown'`. Nunca reenvia (Akita pattern: pode ter sido aceito pelo SendGrid antes do crash). |
| `retryFailedDeliveries({ db, send, ... })` | a cada 5 min | rows `status='failed'` com `sendAttempts < MAX_ATTEMPTS` e `updatedAt < now() - nextAttemptDelaySeconds(attempts)*1000` → re-claim e retenta. Reusa `subject/html/text` persistidos. |
| `syncSendgridSuppressions({ db, apiKey, fetch? })` | 1×/dia | pagina `/v3/suppression/{bounces,blocks,spam_reports,invalid_emails}` e faz upsert em `email_suppressions`. Cobre suppressions silenciosas (Akita pattern #11). |

Apps expõem rotas POST protegidas por `Authorization: Bearer ${CRON_SECRET}` que invocam essas funções. Pattern em `PRODUCTION.md` §7.

---

## 4. Como cada app usa o package

### 4.1 Wire-up obrigatório

```ts
// apps/<app>/src/lib/emails.ts
import { logAuditEvent } from "@informach/auth";
import { db } from "@informach/db";
import { createEmailService, type EmailAuditEvent } from "@informach/emails";
import { env } from "./env";
import { packageLogger } from "./observability";

export function emailAudit(event: EmailAuditEvent): void {
  logAuditEvent(event.eventType, event.actorId, event.payload).catch(() => undefined);
}

export const emails = createEmailService({
  apiKey: env.SENDGRID_API_KEY,
  defaultFrom: env.SENDGRID_FROM,
  db,
  mode: env.EMAIL_SANDBOX_MODE,           // "live" | "sandbox" | "memory"
  sandboxDir: env.EMAIL_SANDBOX_DIR,
  logger: packageLogger,
  onAudit: emailAudit,
});
```

```ts
// apps/<app>/src/lib/auth.ts
import { createAuth } from "@informach/auth";
import { buildUnsubscribeToken } from "@informach/emails";
import { emails } from "./emails";
import { env } from "./env";

export const authResult = createAuth({
  // ... outros campos
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  buildUnsubscribeUrl: (id, category) => {
    const t = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, id, category);
    return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${t}`;
  },
  unsubscribeMailto: `unsubscribe@${new URL(env.NEXT_PUBLIC_APP_URL).hostname}`,
});
```

### 4.2 Rotas operacionais (mínimas)

```ts
// app/api/webhooks/sendgrid/route.ts
import {
  SENDGRID_SIGNATURE_HEADER,
  SENDGRID_TIMESTAMP_HEADER,
  handleSendgridEvents,
  verifySendgridSignature,
} from "@informach/emails/webhook";
import { db } from "@informach/db";
import { emailAudit } from "@/lib/emails";
import { env } from "@/lib/env";
import { packageLogger } from "@/lib/observability";

export async function POST(req: Request) {
  const raw = await req.text();              // raw body, NÃO json()
  const sig = req.headers.get(SENDGRID_SIGNATURE_HEADER);
  const ts = req.headers.get(SENDGRID_TIMESTAMP_HEADER);
  if (!verifySendgridSignature(env.SENDGRID_WEBHOOK_PUBLIC_KEY, raw, sig, ts)) {
    return new Response("forbidden", { status: 403 });
  }
  const events = JSON.parse(raw);
  const result = await handleSendgridEvents({ db, logger: packageLogger, onAudit: emailAudit }, events);
  return Response.json(result);
}
```

Crons seguem o mesmo padrão (Bearer + invoke da função do `./sweepers`).

### 4.3 Env vars consumidas

| Var | Uso |
|---|---|
| `SENDGRID_API_KEY` | `apiKey` |
| `SENDGRID_FROM` | `defaultFrom` (precisa estar verificado/com Domain Authentication no painel SendGrid) |
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | passada ao `verifySendgridSignature` (NÃO ao package) |
| `EMAIL_SANDBOX_MODE` | `mode` ("live" \| "sandbox" \| "memory") |
| `EMAIL_SANDBOX_DIR` | `sandboxDir` |
| `CRON_SECRET` | proteção dos cron jobs (NÃO ao package) |
| `BETTER_AUTH_SECRET` | usado em `buildUnsubscribeToken` no app |

---

## 5. Arquitetura e design

### 5.1 Decisões fixadas

1. **Provider único: SendGrid.** O package tem apenas adapter para SendGrid (`@sendgrid/mail` v8 + `@sendgrid/eventwebhook` v8). Adicionar AWS SES (preferência do "segundo cérebro") é decisão futura — exige extrair `SendFn`/`SuppressionsClient` em `EmailProvider` interface antes.

2. **Idempotência por `(category, messageKey)`.** Index UNIQUE em `email_deliveries`. `messageKey` precisa ser determinístico por evento lógico (em auth: usamos `token` do verify-email/magic-link/reset; org invite: `invitation.id`). `INSERT ... ON CONFLICT DO NOTHING` + leitura subsequente do row existente.

3. **Claim atômico via `UPDATE...WHERE status IN ('pending','failed')`.** Elimina racing entre processos. Quando 0 rows tocadas: `{ ok: false, status: 'deferred', reason: 'in-flight' }`. Consumidores devem manter a operação recuperável; não converter disputa de envio em cancelamento definitivo.

4. **Backoff polinomial, não exponencial.** `attempt^4 + 2s ±15% jitter`. Padrão Akita (vibe-coding-vault). Razão: exponencial (`2^attempt`) explode rápido demais para 8 tentativas; polinomial dá distribuição mais útil em hours-scale.

5. **Templates em React Email, não em ERB/handlebars/strings.** `@react-email/components` normaliza Outlook/Gmail/Apple Mail; `render(...)` produz HTML e text com paridade automática. Preview server: `pnpm --filter @informach/emails preview`.

6. **i18n via `next-intl/createTranslator`, default `"pt-BR"`.** Strings em `messages/<locale>.json`. Templates aceitam `locale?: string`. Sem outro locale ativo hoje — só infraestrutura.

7. **Schema source of truth é Drizzle (`packages/db/src/schema/core.ts`).** Mudanças em `email_deliveries`/`email_suppressions`/`email_unsubscribes` passam por `pnpm db:generate` + `pnpm db:migrate`. Nunca `npx better-auth migrate`.

8. **Webhooks: assinatura ECDSA obrigatória.** `verifySendgridSignature` no entry point. Sem signature válida → 403. Configurar Signed Event Webhook no painel SendGrid + copiar public key para `SENDGRID_WEBHOOK_PUBLIC_KEY`.

9. **Sandbox mode = arquivos em disco.** `mode='sandbox'` é mais útil que `sgMail.mailSettings.sandboxMode` (que ainda chama API SendGrid). Modo `memory` é para testes E2E (Playwright nos apps), sem disco.

10. **`emit-points` try/catch'ed quando vão para logger.** Emit em logger nunca pode quebrar fluxo de envio. Bug em logger é problema do app.

11. **`open`/`click` tracking desabilitados no painel SendGrid.** Decisão de privacidade. Apenas eventos transacionais (delivered/bounce/dropped/spamreport/unsubscribe).

### 5.2 Sub-paths exportados (`exports` em `package.json`)

| Sub-path | Conteúdo | Quem importa |
|---|---|---|
| `@informach/emails` | `createEmailService`, `EmailDeliveryError`, `dispatchEmail` raw, tipos, `buildUnsubscribeToken/verifyUnsubscribeToken` | `apps/<app>/src/lib/emails.ts`, `apps/<app>/src/lib/auth.ts` |
| `@informach/emails/webhook` | `verifySendgridSignature`, `handleSendgridEvents`, header constants | `app/api/webhooks/sendgrid/route.ts` |
| `@informach/emails/sweepers` | `recoverStaleDeliveries`, `retryFailedDeliveries`, `syncSendgridSuppressions` | `app/api/jobs/*/route.ts` |
| `@informach/emails/unsubscribe` | `processUnsubscribe` | `app/api/email/unsubscribe/route.ts` |
| `@informach/emails/templates` | `renderTemplate` direto + componentes React Email para preview server | preview server, testes |

---

## 6. Testes

Vitest 5.0.5 em `src/__tests__/`, com JSX automático via Oxc/Vite 8. Renderização atual: `@react-email/components@1.0.12` e `@react-email/render@2.1.1`. Ao atualizar o renderer, revisar conteúdo, links e HTML dos snapshots, não apenas aceitá-los novamente.

| Arquivo | Cobertura |
|---|---|
| `dispatch.test.ts` | Validação Zod, sandbox/memory mode, live, idempotência, retry/permanent classification, audit sent/skipped/failed, aviso de queda que passa pelo descadastro e resumo da semana que não passa |
| `delivery-policy.test.ts` | Quais categorias obedecem ao descadastro |
| `webhook.test.ts` | Signed verification, parsing de eventos, transições de status, audit suppression/unsubscribe |
| `retry.test.ts` | `nextAttemptDelaySeconds`, `classifySendgridError` |
| `sweepers.test.ts` | `recoverStaleDeliveries`, `retryFailedDeliveries`, `syncSendgridSuppressions`, audit retry/suppression |
| `unsubscribe.test.ts` | HMAC build/verify, timing-safe, casos de erro, audit sem email bruto |
| `templates.test.tsx` | Snapshot inline de cada template (HTML + text) |

DB nos testes: `_fake-db.ts` mocka Drizzle (não toca Postgres). Para integração real → Playwright nos apps com `mode='memory'` ou `mode='sandbox'`.

```bash
pnpm --filter @informach/emails test
pnpm --filter @informach/emails typecheck
pnpm --filter @informach/emails preview     # preview server React Email em :4080
```

---

## 7. Regras para agentes

1. **Antes de mexer em template visual**, rodar checklist de `EMAILS.md`. Snapshot break não é bug — é o ponto.

2. **Schema novo em `email_deliveries`/`email_suppressions`/`email_unsubscribes`?** Editar `packages/db/src/schema/core.ts`, gerar migration via `pnpm db:generate`, validar localmente com `pnpm db:migrate`. Atualizar tipo `NewEmailDelivery` automaticamente vem via `$inferInsert`.

3. **Adicionar nova `EmailCategory`?** (a) Editar union em `dispatch.ts`. (b) Adicionar em `EMAIL_CATEGORIES` array no `schemas.ts`. (c) Editar union em `templates/index.ts:EmailCategory`. (d) Adicionar entry em `RenderTemplatePropsByCategory` e `CATEGORY_REGISTRY` (com `subjectNamespace` + `subjectValues`). (e) Criar componente em `templates/<name>.tsx` com `PreviewProps`. (f) Adicionar `EmailNamespace` em `i18n.ts`. (g) Adicionar strings PT-BR em `messages/pt-BR.json` (subject/preheader/title/body/instruction/cta — warning opcional). (h) Snapshot test. (i) Atualizar tabela em §3.3 deste doc. **Para categorias `billing.*`** atualizar também `BillingEmailCategory` em `@informach/billing/billing-emails.ts` se for disparada por webhook handler.

4. **Mudanças em retry/backoff** afetam recovery jobs — testar com `nextAttemptDelaySeconds(N)` para vários N. `MAX_ATTEMPTS=8` é o teto absoluto.

5. **Webhook handler é try/catch'ed por evento.** Adicionar `event` novo: `case 'X': ...; return;`. Default (`return;`) ignora silenciosamente — intencional para eventos não-rastreados.

6. **Logger emit-points devem ser try/catch'ed.** Falha em logger não pode quebrar envio.

7. **Não importar `react`/`@react-email/*` fora de `templates/`.** Mantém o sub-path tree-shakeable e o core (dispatch/webhook/sweepers) sem dependência de React.

8. **Não usar Resend ou outro provider.** Adicionar provider novo é refatoração (extrair `EmailProvider` interface) — fase própria, com aprovação do usuário.

9. **`unsubscribeUrl` deve passar pelo `buildUnsubscribeToken`.** Não fabricar URLs manualmente.

10. **Adicionar dep nova?** Conferir que ela suporta Node 20+, ESM, e não puxa Next.js (o package não tem dependência de Next).

11. **Novo caminho que muta delivery/suppression/unsubscribe?** Emitir `email.*` via `emitEmailAudit`, sem email bruto no payload. Use `emailHash`/`emailDomain` para destinatario e veja [`docs/audit-payload-policy.md`](../../docs/audit-payload-policy.md).

---

## 8. Próximos passos potenciais (fora do escopo atual)

- **Provider SES** com fallback automático SendGrid → SES em erro 5xx (vault prefere SES por custo).
- **i18n locales adicionais** (`en.json`) — infra já pronta, só precisa do JSON e atualizar mapping.
- **Dashboard de deliverability** — view materializada agregando `email_deliveries.status` por categoria/dia. Hoje só painel SendGrid.
- **Per-recipient rate limit local** — hoje confiamos no throttling do SendGrid.
- **Attachments** — `@sendgrid/mail` suporta; adicionar em `SendEmailInput` quando o produto pedir.
- **`asm.groupId`** (Advanced Suppression Manager do SendGrid) — útil se quisermos delegar unsubscribe nativo. Hoje o nosso é custom (HMAC).

Para retomar trabalho de fase, perguntar ao usuário qual fase está autorizada — cada fase é entregável independente.
