# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace

`informach-platform` is a pnpm + Turborepo monorepo (pnpm@9.15.0, turbo@2.9.6, TypeScript 5.6, Node ≥20, Biome 2.4 for lint+format).

- **Apps** (`apps/`):
  - `admin` (port 3003) — scaffold, no auth/billing/db wiring yet; keep dependencies minimal until it becomes a real app.
  - `agenda-da-turma` (port 3001) — multi-tenant (Better Auth organizations enabled), Sentry, Vitest + Playwright.
  - `cozya` (port 3002) — single-user (no organizations), Sentry, Vitest + Playwright.
- **Packages** (`packages/`, scope `@informach/*`): `db`, `auth`, `billing`, `emails`, `ai-core`, `config`, `ui`. All consumed as TypeScript source — none have a build step.

Per-package deep guides exist and should be consulted before non-trivial changes:
- `packages/auth/CLAUDE.md`
- `packages/billing/CLAUDE.md`
- `packages/emails/CLAUDE.md`
- `packages/ai-core/CLAUDE.md`

Cross-cutting docs in `docs/`: `arquitetura-monorepo.md`, `arquitetura-apps.md`, `arquitetura-packages.md`, `audit-payload-policy.md`, `adr/0001-uso-de-monorepo.md`.

## Commands

### Workspace-wide (root scripts)
- `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm test` — Turbo across the workspace.
- `pnpm check` / `pnpm lint` / `pnpm format` — Biome (not ESLint/Prettier).
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` / `pnpm db:push` — delegated to `@informach/db` (Drizzle Kit).

### Per app
- `pnpm dev:admin` | `pnpm dev:agenda-da-turma` | `pnpm dev:cozya`
- `pnpm build:<app>` | `pnpm start:<app>`

### Single test
- Vitest: `pnpm --filter @informach/<app> vitest run path/to/file.test.ts -t "test name"`
- Playwright E2E: `pnpm --filter @informach/<app> exec playwright test <file>`

## Architecture pillars

### Packages are consumed as TypeScript source
Each package exposes its surface via `package.json` `exports` pointing at `src/`. Apps add every consumed `@informach/*` to `transpilePackages` in `next.config.ts`. **Never add a build step to a shared package** — see `docs/arquitetura-packages.md`.

### Auth and the Next 16 proxy
- Better Auth 1.6.9 wrapped by `@informach/auth`. RBAC is custom (4 roles: owner/admin/member/guest, 8 permissions) — *not* the Better Auth admin plugin.
- Apps use `src/proxy.ts` (Next 16's replacement for `middleware.ts`) calling `createAuthProxy(authResult, { publicPaths, requireAuth })` — see `apps/agenda-da-turma/src/proxy.ts` and `apps/cozya/src/proxy.ts`. New routing-level guards go through proxy.ts; consult context7 before touching Next routing primitives.
- Cookie cache 5 min by default; role changes invalidate sessions immediately.
- `agenda-da-turma` has organizations enabled; `cozya` does not.
- **Email plugin choice is per-app via `config.email`** in `createAuth`/`createInformachAuthClient`: `verification: "otp" | "link"` (default `"otp"`), `signIn: { magicLink: bool, otp: bool }` (defaults `true`/`false`), `forgetPassword: "link" | "otp"` (default `"link"`). The package conditionally loads `magicLink`/`emailOTP` plugins and registers link callbacks (`sendVerificationEmail`/`sendResetPassword`) only when needed. **Cozya is OTP-only** (verification + sign-in + forget-password); `agenda-da-turma` uses defaults (OTP signup + magic-link sign-in + link reset). See `packages/auth/CLAUDE.md` §3.2.
- Account deletion (LGPD) calls `billing.cancelBillingForSubject` via the auth `onBeforeDelete` hook.
- Audit is typed through `AuditEventType`; packages emit through app-wired `onAudit` callbacks and persistence failures are reported via `observability.onAuditPersistenceFailure`.

### Billing — Stripe Dahlia + reserve/commit credits
- `stripe@^22.1.0` pinned with `apiVersion: '2026-04-22.dahlia'` (literal). Note Basil/Dahlia changes: `current_period_*` lives on `items.data[i]`, `checkout.session.completed` fires *before* the subscription event, `total_count` is removed, monetary math uses `Stripe.Decimal`.
- Two models in one API: subscriptions + credit packs for AI usage.
- **Reserve → commit/release** with a Postgres advisory lock per owner. Concurrent LLM calls must never debit balance directly.
- Owner subject is `org` for agenda-da-turma, `user` for cozya.
- Idempotence in 3 layers: `webhookEvents` UNIQUE, table-level UNIQUE, `creditLedger.stripeEventId` UNIQUE.
- Sweepers: reconcile (1d), expire-bonus (1d), release-reservations (5min), dunning-retry (6h).

### Emails — idempotent SendGrid pipeline
- React Email + `next-intl`. Idempotency keyed by `(category, messageKey)` UNIQUE; atomic claim via `UPDATE … WHERE status IN ('pending','failed')`.
- Polynomial backoff `attempt^4 + 2s ± 15%`, max 8 attempts.
- Three modes: `live` (SendGrid), `sandbox` (disk), `memory` (E2E tests).
- Webhook handler must preserve `rawBody` **before** `JSON.parse` (ECDSA verification).
- Sweepers: recover-stale (30min), retry-failed (5min), sync-suppressions (1d).
- Email audit events (`email.delivery_*`, `email.unsubscribe_recorded`, `email.suppression_recorded`) are optional via `onAudit`; payloads use `emailHash`/`emailDomain`, never raw recipient email.

### Database — Drizzle is the source of truth
- All schema lives in `@informach/db` (no Better Auth CLI, no hand-written SQL). Postgres schemas: `core`, `billing`, `audit`, `ai`, `agenda`, `cozya`.
- Schema changes flow through `pnpm db:generate` → `pnpm db:migrate`.
- `audit.events` is append-only operational/compliance logging. Payload rules and LGPD/PII limits are documented in `docs/audit-payload-policy.md`.
- **Exception**: Mastra owns the `ai_mastra` schema (tables `mastra_threads`, `mastra_messages`, `mastra_traces`, `mastra_scorers`, `mastra_evals`, `mastra_workflow_snapshot`, `mastra_resources`). It auto-creates them on first call. `ai_mastra` is intentionally absent from `drizzle.config.ts` `schemaFilter` so `db:generate` never proposes DROP. Migration `0010_create_ai_mastra_schema.sql` only runs `CREATE SCHEMA IF NOT EXISTS`.

### AI agents — Mastra base in `@informach/ai-core`
- `@mastra/core@^1.31` + `@mastra/pg` + `@mastra/loggers` + `@mastra/memory` + AI SDK v5 providers (`@ai-sdk/anthropic`, `@ai-sdk/openai`).
- Apps consume factories: `createMastra`, `createPostgresStore` (default `schemaName: "ai_mastra"`), `createSharedMemory`, `createAnthropic`/`createOpenAI`, `createDefaultLogger`. Agents themselves live in `apps/<app>/src/ai/`, never in the package.
- `runId` UUID is the cross-schema link: `withCredits` `reservation.id` ≡ `agent.generate({ runId })` ≡ `ai.agent_runs.id` ≡ `ai_mastra.mastra_traces.runId`. Always pass it through.
- See `packages/ai-core/CLAUDE.md` for the full contract.

## Build & CI conventions

- **Turbo env list drives cache invalidation.** `turbo.json` `tasks.build.env` enumerates every variable that affects build output (`DATABASE_URL`, `BETTER_AUTH_*`, `SENDGRID_*`, `STRIPE_*`, `SENTRY_*`, `REDIS_URL`, `GOOGLE_*`, `NEXT_PUBLIC_APP_URL`, …). Any new build-affecting env must be added there or Turbo will silently serve stale output.
- **Builds run with dummy envs.** Apps validate env via `@t3-oss/env-nextjs` (Zod). The DB client initializes lazily (Proxy) so `pnpm build` succeeds without a live database. Don't open real connections at module load.
- **External SDK pinning.** Before changing `stripe`, `better-auth`, `@sendgrid/mail`, or any versioned SDK, validate `apiVersion` and payload shapes via context7 + installed `@types/*`. Don't use `as any` to suppress a version mismatch — fix the type, then update both code and pin.
