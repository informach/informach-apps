# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read [AGENTS.md](AGENTS.md) first.** It is the shared entry point for repository context, provider choices, safety rules and mandatory documentation maintenance. Then read [docs/estado-do-repositorio.md](docs/estado-do-repositorio.md) for the active work and the applicable local guides. Keep common policy in `AGENTS.md`; the summaries below do not replace current app-specific contracts or operational evidence.

## Workspace

`informach-apps` (historically `informach-platform`) is a pnpm + Turborepo monorepo. Resolve runtime/tool versions from root `package.json`, `pnpm-lock.yaml` and CI, not this summary. The current Node requirement is ≥24.15.0; `.nvmrc` (24.15.0) is also what Railway builds with, through `RAILPACK_NODE_VERSION` in `.railway/railway.ts`. Biome handles lint and formatting.

- **Apps** (`apps/`):
  - `admin` (port 3003): **Bastidores**, staff console at `admin.informach.com.br`: owner/admin roles with mandatory TOTP two-factor, read-only DB connection for screens, `admin.*` audit events (opening a person's page is audited), no impersonation and no family content. Rules and data sources in `apps/admin/CLAUDE.md`; deploy in `apps/admin/PRODUCAO.md`.
  - `agenda-da-turma` (port 3001) — family school routine, unified activities and notices, child profiles and invited adults with per-child permissions. Billing belongs to the holder; Better Auth organizations are disabled. Do not collapse invited-adult identity into the holder. Product rules, limits and current flows are in the app's `CLAUDE.md`.
  - `cozya` (port 3002) — single-user (no organizations), Sentry, Vitest + Playwright.
  - `missao-saber` (port 3005) — single-user com perfis familiares, preparação autoral para olimpíadas escolares, Sentry, Vitest + Playwright. Auth, billing, banco, e-mails e UI vêm dos packages compartilhados.
  - `bora-treinar` (port 3007) — guided bodyweight training for families: 3D instructor, on-device camera rep counting (MediaPipe), family profiles (up to 4 on the Family plan), levels, weekly challenges, custom workout editor, e-mail reminders and weekly summary, phone-as-camera pairing for the TV. Same architecture as Missão Saber (single-user with family profiles, Redis sessions with cookie cache off, Sentry, Vitest + Playwright); no AI and no credits. Its build downloads the MediaPipe model and WASM into `public/mediapipe`. Operation in `apps/bora-treinar/PRODUCAO.md`.
  - `informach-site` (port 3004): landing institucional pública (`informach.com.br`). Sem auth/billing/db/AI; só Next, `@informach/ui` e `@informach/config` (preços do catálogo e contato público). Hospeda Termos e Privacidade guarda-chuva da holding (Stripe Customer Portal aponta pra cá).
  - `edi` (port 3006) — suite portal, subscriptions and desktop licensing; follows the existing Railway setup at `edi.informach.com.br`, with deployment still pending as documented in `apps/edi/PRODUCAO.md`.
  - `edi-hub`, `ediaula`, `edicaptura`, `edifoto`, `edipdf`, `edisvg` — Electron suite under integration. Preserve existing interfaces; completing missing editor features is outside the integration scope. Read `docs/arquitetura-desktop.md` and the Edi implementation record before changes.
- **Packages** (`packages/`, scope `@informach/*`): `db`, `auth`, `billing`, `emails`, `ai-core`, `config`, `ui`, `edi-contracts`, `edi-desktop`, `edi-licensing`, `edi-releases`. All consumed as TypeScript source — none have a build step.

Per-package deep guides exist and should be consulted before non-trivial changes:
- `packages/auth/CLAUDE.md`
- `packages/billing/CLAUDE.md`
- `packages/emails/CLAUDE.md`
- `packages/ai-core/CLAUDE.md`
- `apps/agenda-da-turma/CLAUDE.md`
- `apps/cozya/CLAUDE.md`
- `apps/informach-site/CLAUDE.md`
- `apps/missao-saber/README.md` and `apps/missao-saber/PRODUCAO.md`
- `apps/bora-treinar/CLAUDE.md`, `apps/bora-treinar/README.md` and `apps/bora-treinar/PRODUCAO.md`
- `apps/admin/CLAUDE.md` and `apps/admin/PRODUCAO.md`
- `apps/edi/PRODUCAO.md`

Cross-cutting docs in `docs/`: `arquitetura-monorepo.md`, `arquitetura-apps.md`, `arquitetura-desktop.md`, `arquitetura-packages.md`, `audit-payload-policy.md`, `deploy-runbook.md` (Railway/Stripe/Sentry — passo-a-passo de deploy de app, derivado do cozya), `adr/0001-uso-de-monorepo.md`. Current work is indexed in `docs/estado-do-repositorio.md`; keep evidence and temporary blockers in the relevant implementation/operation record.

## Commands

### Workspace-wide (root scripts)
- `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm test` — Turbo across the workspace.
- `pnpm check` / `pnpm lint` / `pnpm format` — Biome (not ESLint/Prettier).
- `pnpm db:generate` / `pnpm db:studio` / `pnpm db:push` — delegated to `@informach/db` (Drizzle Kit); never use `db:push` in production. `pnpm db:migrate` runs Drizzle migrations, the task backfill and Mastra storage initialization, as defined in root `package.json`.

### Per app
- `pnpm dev:admin` | `pnpm dev:agenda-da-turma` | `pnpm dev:cozya` | `pnpm dev:missao-saber` | `pnpm dev:bora-treinar` | `pnpm dev:informach-site` | `pnpm dev:edi`
- `pnpm build:<app>` | `pnpm start:<app>`
- Edi desktop tools: `pnpm --filter @informach/<tool> dev` stops at the suite access window. To open a tool licensed for manual testing (no portal/account/subscription, Windows only): `pnpm edi:open <tool>` — see `docs/desenvolvimento-edi.md` §5.

### Single test
- Vitest: `pnpm --filter @informach/<app> exec vitest run path/to/file.test.ts -t "test name"`
- Playwright E2E: `pnpm --filter @informach/<app> exec playwright test <file>`

## Architecture pillars

### Packages are consumed as TypeScript source
Each package exposes its surface via `package.json` `exports` pointing at `src/`. Next.js apps add every consumed `@informach/*` to `transpilePackages` in `next.config.ts`; Electron apps bundle those sources according to `docs/arquitetura-desktop.md`. **Never add a build step to a shared package** — see `docs/arquitetura-packages.md`.

### Auth and the Next 16 proxy
- Better Auth is wrapped by `@informach/auth`; the installed family/plugins are declared together in its manifest. RBAC is custom (4 roles: owner/admin/member/guest, 8 permissions) — *not* the Better Auth admin plugin. App-specific family and device authorization remains separate from this generic RBAC.
- Web apps with routing-level guards use `src/proxy.ts` (Next 16) and `createAuthProxy` — see Agenda and Cozya. Follow the current app's pattern and consult current docs before changing routing primitives. Proxy checks do not replace authentication/authorization inside Server Actions, Route Handlers and protected data access.
- Cookie cache 5 min by default; role changes invalidate sessions immediately.
- Em `agenda-da-turma` e `cozya`, a assinatura pertence ao usuário titular, sem Better Auth organizations: `organizationsEnabled: false` no `createBillingService` e sem o plugin de organização no `createAuth`/`createInformachAuthClient`. Na Agenda, isso não elimina a identidade própria e as permissões por criança dos adultos convidados.
- **Email plugin choice is per-app via `config.email`** in `createAuth`/`createInformachAuthClient`: `verification: "otp" | "link"` (default `"otp"`), `signIn: { magicLink: bool, otp: bool }` (defaults `true`/`false`), `forgetPassword: "link" | "otp"` (default `"link"`). The package conditionally loads `magicLink`/`emailOTP` plugins and registers link callbacks (`sendVerificationEmail`/`sendResetPassword`) only when needed. **Cozya e Agenda da Turma são ambos OTP-only** (verification + sign-in + forget-password). See `packages/auth/CLAUDE.md` §3.2.
- Account deletion (LGPD) calls `billing.cancelBillingForSubject` via the auth `onBeforeDelete` hook.
- Audit is typed through `AuditEventType`; packages emit through app-wired `onAudit` callbacks and persistence failures are reported via `observability.onAuditPersistenceFailure`.

### Billing — Stripe Dahlia + reserve/commit credits
- `stripe@^22.1.0` pinned with `apiVersion: '2026-04-22.dahlia'` (literal). Note Basil/Dahlia changes: `current_period_*` lives on `items.data[i]`, `checkout.session.completed` fires *before* the subscription event, `total_count` is removed, monetary math uses `Stripe.Decimal`. `invoices.retrieveUpcoming` was replaced by `invoices.createPreview` (used by `previewPlanChange`).
- Two models in one API: subscriptions + credit packs for AI usage.
- **Generic Pro subscription checks** live in `packages/billing/src/access.ts`: `PRO_STATUSES = ["active", "trialing"]` + `hasProSubscription(subject)`. Never inline `status === "active"`; `past_due` is not Pro. Product access may include additional rules: Cozya has `getKitchenAccess`, and Edi uses paid-period facts and signed licenses in `@informach/edi-licensing`. Do not replace those policies with a generic status check.
- **Plan changes** (`switchPlan`/`reactivateSubscription`/`previewPlanChange`): immediate upgrades charge proration via `always_invoice`; downgrades schedule via `pending_product_id`/`pending_price_id` columns, applied by the `subscription.deleted` webhook handler. `paymentActionUrl` returned when invoice ends up unpaid (no default PM, SCA, decline).
- **Reserve → commit/release** with a Postgres advisory lock per owner. Concurrent LLM calls must never debit balance directly.
- **Credit packs are Pro-only** — `createCreditPackCheckout` rejects with `SubscriptionRequiredError` when subject lacks active Pro. UI hides the section for Free users.
- **Single-subscription invariant** — `createSubscriptionCheckout` rejects with `AlreadySubscribedError` if the subject already has any active-ish row (active/trialing/past_due). Apps should route to `switchPlan`.
- **Annual plans drip configured credits monthly** — annual `invoice.paid` does NOT grant 12× upfront; it seeds `next_credit_grant_at = now + 30d`, and the daily sweeper `grantPendingMonthlyBonusCredits` releases the product's configured amount every 30d. `subscription_update` invoices are excluded from cycle-grant logic. Edi does not include paid AI consumption in its suite subscription.
- **`priceId` is authoritative over `metadata.product_id`** in webhooks — Stripe metadata doesn't migrate when `subscriptions.update` swaps prices, so the package resolves products via `stripePriceId.{dev,prod}` first.
- Em `agenda-da-turma` e `cozya`, o owner subject de billing é `user`, independentemente dos perfis e das permissões de colaboração do produto. Isolamento entre apps é feito pela coluna `app` em `billing.customers` e `billing.credit_ledger` — UNIQUE composto `(provider, subjectType, subjectId, app)` permite customers Stripe distintos para o mesmo `user.id` em apps diferentes. Cada `createBillingService` recebe `app: APPS.<app>.slug` no config.
- Idempotence in 3 layers: `webhookEvents` UNIQUE, table-level UNIQUE, `creditLedger.stripeEventId` UNIQUE. Idempotency keys for checkouts default to a 5-minute window when no nonce is supplied.
- Sweepers: reconcile (1d), expire-bonus (1d), grant-monthly (1d, annual drip), release-reservations (5min), dunning-retry (6h).

### Emails — idempotent SendGrid pipeline
- React Email + `next-intl`. Idempotency keyed by `(category, messageKey)` UNIQUE; atomic claim via `UPDATE … WHERE status IN ('pending','failed')`.
- Polynomial backoff `attempt^4 + 2s ± 15%`, max 8 attempts.
- Three modes: `live` (SendGrid), `sandbox` (disk), `memory` (E2E tests).
- Webhook handler must preserve `rawBody` **before** `JSON.parse` (ECDSA verification).
- Sweepers: recover-stale (30min), retry-failed (5min), sync-suppressions (1d).
- Email audit events (`email.delivery_*`, `email.unsubscribe_recorded`, `email.suppression_recorded`) are optional via `onAudit`; payloads use `emailHash`/`emailDomain`, never raw recipient email.

### Database — Drizzle is the source of truth
- All application schema lives in `@informach/db`; do not generate a competing auth schema or rewrite applied migrations. SQL changes belong to the reviewed Drizzle migration workflow. Managed Postgres schemas are listed in `packages/db/drizzle.config.ts`, including `missao_saber` and `edi` in addition to the shared domains.
- Schema changes flow through `pnpm db:generate` → `pnpm db:migrate`.
- **O migrator é um service separado, e o healthcheck é que garante a ordem.** `checkSchemaReadiness()` (em `@informach/db`) compara a última migração do journal deste build com `max(created_at)` em `drizzle.__drizzle_migrations`. Os três apps expõem isso em `/api/ready`, que é o `healthcheckPath` no Railway: banco atrás do build → 503 → a instância nova não recebe tráfego. A pergunta é "atrás", nunca "diferente", então rollback do app sem desfazer migração continua passando. `/api/health` é outra coisa e não toca o banco de propósito — é ele que diz qual commit está servindo quando um deploy vai mal.
- `audit.events` is append-only operational/compliance logging. Payload rules and LGPD/PII limits are documented in `docs/audit-payload-policy.md`.
- The `ops` schema (`job_runs`, `service_status`) holds operation facts read by the Bastidores, never personal data. Every scheduled `/api/jobs/*` routine wraps its work in `recordJobRun({ app, job }, fn)` from `@informach/db`, which stores only numeric/boolean fields of the result. Read-only dashboards use `createReadOnlyDatabase(url)` (every transaction opens with `default_transaction_read_only`).
- **Exception**: Mastra owns the `ai_mastra` schema (tables `mastra_threads`, `mastra_messages`, `mastra_traces`, `mastra_scorers`, `mastra_evals`, `mastra_workflow_snapshot`, `mastra_resources`). `ai_mastra` is intentionally absent from `drizzle.config.ts` `schemaFilter` so `db:generate` never proposes DROP. Migration `0010_create_ai_mastra_schema.sql` creates the empty schema, and `pnpm db:migrate` runs `PostgresStore.init()` to create/update Mastra tables outside app runtime.

### AI agents — Mastra base in `@informach/ai-core`
- `@mastra/core@^1.31` + `@mastra/pg` + `@mastra/loggers` + `@mastra/memory` + AI SDK v6 providers (`@openrouter/ai-sdk-provider`, `@ai-sdk/anthropic`, `@ai-sdk/openai`).
- **OpenRouter is the primary gateway**: cozya routes all AI calls (chat, vision, web search, Whisper transcription via `/audio/transcriptions` OpenAI-compatible) through `createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })`. `createOpenAI`/`createAnthropic` remain available for apps that need a direct provider.
- Apps consume factories: `createMastra`, `createPostgresStore` (default `schemaName: "ai_mastra"`), `createSharedMemory`, `createOpenRouter`/`createAnthropic`/`createOpenAI`, `createDefaultLogger`. Agents themselves live in `apps/<app>/src/ai/`, never in the package.
- `runId` UUID is the cross-schema link: `withCredits` `reservation.id` ≡ `agent.generate({ runId })` ≡ `ai.agent_runs.id` ≡ `ai_mastra.mastra_traces.runId`. Always pass it through.
- See `packages/ai-core/CLAUDE.md` for the full contract.

## Build & CI conventions

- **Turbo env list drives cache invalidation.** `turbo.json` `tasks.build.env` enumerates every variable that affects build output (`DATABASE_URL`, `BETTER_AUTH_*`, `SENDGRID_*`, `STRIPE_*`, `SENTRY_*`, `REDIS_URL`, `GOOGLE_*`, `NEXT_PUBLIC_APP_URL`, …). Any new build-affecting env must be added there or Turbo will silently serve stale output.
- **CI builds use isolated/placeholder envs.** Apps validate their own env with Zod or `@t3-oss/env-nextjs`, according to the consumer. The DB client initializes lazily (Proxy); don't open real connections at module load. A compiled build is not a production deployment or commercial homologation.
- **External SDK pinning.** Before changing `stripe`, `better-auth`, `@sendgrid/mail`, or any versioned SDK, validate `apiVersion` and payload shapes via context7 + installed `@types/*`. Don't use `as any` to suppress a version mismatch — fix the type, then update both code and pin.
