# `@informach/auth` — package guide

> Documentação primária do package para humanos e agentes. Para checklist de produção (Railway, CSP, Redis, cron), ver [`PRODUCTION.md`](./PRODUCTION.md). Para validação de templates de email, ver [`@informach/emails/EMAILS.md`](../emails/EMAILS.md) (templates moved).

---

## 1. Propósito

`@informach/auth` é o wrapper opinativo de **Better Auth 1.6.9** (pinned) usado pelos apps Next.js do monorepo `informach-platform` (`agenda-da-turma`, `cozya`, futuros). Ele encapsula:

- A construção da instância Better Auth com schema, plugins, hooks de audit e templates de email pré-amarrados.
- Helpers tipados para RSC, route handlers, proxy (Next 16) e server actions.
- A matriz de RBAC custom (`Role` × `Permission`) — sem usar o plugin oficial `admin()`.
- Funções de manutenção idempotentes para cron jobs.

O package **não** decide UI, **não** lê env vars próprias, e **não** renderiza páginas de auth — cada app fornece config via `createAuth({...})` e expõe a auth handler em `app/api/auth/[...all]/route.ts`.

---

## 2. Como funciona (diagrama mental)

```
apps/<app>/src/lib/
  ├── env.ts            ← Zod-validated env vars
  ├── emails.ts         ← createEmailService de @informach/emails
  ├── auth.ts           ← createAuth({...}) → authResult
  ├── auth-client.ts    ← createInformachAuthClient({...}) (browser)
  ├── observability.ts  ← authObservability/packageLogger app-level
  └── action.ts         ← createActionFactory({ helpers: authResult })

apps/<app>/src/app/api/auth/[...all]/route.ts
  └── exports GET/POST → auth.handler(request)

apps/<app>/src/proxy.ts (Next 16; não middleware.ts)
  └── createAuthProxy(authResult, { publicPaths, requireAuth, requireRole })

@informach/auth source
  ├── index.ts          ← createAuth() factory + tipos
  ├── client.ts         ← createInformachAuthClient (React)
  ├── server.ts         ← createServerHelpers (RSC)
  ├── proxy.ts          ← createAuthProxy (Next 16)
  ├── server-actions.ts ← createActionFactory + Result helpers
  ├── maintenance.ts    ← cleanups idempotentes
  ├── helpers.ts        ← buildHelpers (getCurrentUser, requireRole, ...)
  ├── permissions.ts    ← ROLES, PERMISSIONS, roleHasPermission
  ├── audit.ts          ← logAuditEvent → audit.events table
  └── observability.ts  ← AuthAuditEvent / AuthSecurityEvent types
```

> Templates de email viviam em `templates.ts` neste package; foram migrados para `@informach/emails/src/templates/*.tsx` (componentes React Email). Auth recebe `renderTemplate` na config e chama por categoria.

Schema das tabelas usadas (FK e índices):

- `core.users` — adiciona `role`, `banned`, `banReason`, `banExpiresAt`, `twoFactorEnabled` ao schema padrão Better Auth.
- `core.sessions` — coluna `role` adicional para `cacheRoleOnSession`. FK cascade para `users`.
- `core.accounts`, `core.verifications`, `core.rate_limit` — schema Better Auth padrão.
- `core.organizations`, `core.members`, `core.invitations` — só usados quando `organizations.enabled`. `members` tem `uniqueIndex(userId, organizationId)`.
- `core.passkeys`, `core.two_factors` — só usados quando `passkey.enabled`/`twoFactor.enabled`.
- `audit.events` — alvo de todo `logAuditEvent()`. Emite via `databaseHooks` e `hooks.after` do middleware Better Auth.

Todas as colunas declaradas em `packages/db/src/schema/core.ts` (source of truth) e mapeadas via `drizzleAdapter({ schema: { user, session, ... } })`.

---

## 3. Funcionalidades

### 3.1 Built-in (sempre on)
| Feature | Detalhe |
|---|---|
| Email + password | `emailAndPassword.enabled = true`, com `requireEmailVerification: true` |
| Email verification | `sendOnSignUp: true`, `autoSignInAfterVerification: true`, template `auth.verify-email` |
| Password reset | `revokeSessionsOnPasswordReset: true`, template `auth.password-reset` |
| Magic link | Plugin `magicLink`, template `auth.magic-link` (cria user na primeira ocorrência — limitação Better Auth 1.x documentada) |
| Cookie session cache | Default 300s (`session.cookieCache.maxAge`); override por config |
| Rate limit | Defaults endurecidos contra enumeration (ver tabela em §3.4) |
| Audit log | 36 `AuditEventType` tipados → `audit.events` |
| ID generator | `crypto.randomUUID()` para todas as tabelas |

### 3.2 Opt-in (passe na config para ativar)
| Feature | Config | Tabelas extras |
|---|---|---|
| `disableSignup` | `disableSignup: true` | — |
| Organizations (multi-tenant) | `organizations: { enabled: true, allowUserToCreateOrganization? }` | `organizations`, `members`, `invitations` |
| Google OAuth | `socialProviders: { google: { clientId, clientSecret, redirectURI? } }` | — |
| Passkey (WebAuthn) | `passkey: { enabled: true, rpName?, rpID?, origin? }` | `passkeys` |
| 2FA TOTP + backup codes | `twoFactor: { enabled: true, issuer? }` | `two_factors` |
| Account deletion (LGPD) | `accountDeletion: { enabled: true, sendDeleteEmail?, onBeforeDelete?, onAfterDelete? }` | — |
| Cache role on session | `cacheRoleOnSession: true` | reaproveita `sessions.role` |
| Secondary storage (Redis/KV) | `secondaryStorage: SecondaryStorage` | — |
| Observability | `observability: { onAuditEvent?, onAuditPersistenceFailure?, onSecurityEvent? }` | — |
| Rate-limit overrides | `rateLimitRules: { "/path": { window, max } }` | — |

### 3.3 RBAC custom (não usa plugin `admin`)

`ROLES` (em ordem de privilégio): `owner`, `admin`, `member`, `guest`. Default em sign-up: `member`.

`PERMISSIONS` (de `permissions.ts`):

| Permission | Roles permitidos |
|---|---|
| `users.list` | owner, admin |
| `users.invite` | owner, admin |
| `users.set_role` | owner |
| `users.ban` | owner, admin |
| `billing.manage` | owner |
| `content.create` | owner, admin, member |
| `content.delete` | owner, admin |

Helpers expostos pelo `createAuth()` result:
- `hasRole(user, role): boolean`
- `assertRole(user, role): void` (joga `ForbiddenError`)
- `assertPermission(user, permission): void`
- `requireRole(headers, role): Promise<User>` (joga `UnauthorizedError` ou `ForbiddenError`)
- `requireAdmin(headers): Promise<User>` (atalho para `requireRole(_, "admin")`)

Manipulação de role/ban dispara `databaseHooks.user.update.before` que loga `user.role_changed` / `user.banned` / `user.unbanned` no audit. Quando `cacheRoleOnSession: true`, mudar role também invalida sessions ativas via `db.delete(sessions).where(eq(userId, target))` para forçar refresh.

### 3.4 Rate limits default

| Endpoint | Window | Max |
|---|---|---|
| `/sign-in/email` | 60s | 5 |
| `/sign-up/email` | 1h | 5 |
| `/forget-password` | 1h | 3 |
| `/sign-in/magic-link` | 10min | 5 |
| `/verify-email` | 60s | 10 |
| `/reset-password` | 1h | 5 |

Defaults globais Better Auth: `window: 60, max: 100`. Storage automático: `database` (tabela `core.rate_limit`) ou `secondary-storage` quando Redis fornecido. Override via `rateLimitRules: { ... }` na config.

### 3.5 Audit log (tipado)

`AuditEventType` (de `audit.ts`):

```
user.created            session.created        org.created
user.email_changed      session.revoked        org.member_added
user.password_changed   account.linked         org.member_removed
user.role_changed       email.verified         org.invitation_sent
user.banned             auth.sign_out
user.unbanned           auth.forget_password_requested
user.deletion_requested auth.password_reset_completed
user.deleted            auth.two_factor_enabled
                        auth.two_factor_disabled
                        auth.two_factor_verified
                        auth.backup_code_used

email.delivery_sent     email.unsubscribe_recorded
email.delivery_failed   email.suppression_recorded
email.delivery_skipped

billing.subscription_created    billing.payment_succeeded   billing.credits_consumed
billing.subscription_updated    billing.payment_failed      billing.credits_refunded
billing.subscription_canceled   billing.credits_granted
```

Cada `logAuditEvent(eventType, actorId, payload)` insere em `audit.events` e dispara `observability.onAuditEvent`. Se o INSERT falhar, o fluxo continua e `observability.onAuditPersistenceFailure` recebe `{ eventType, actorId, payloadKeys, error }` sanitizado. **Hooks são try/catch-ados internamente** — falha em APM ou no banco de audit não derruba o auth.
Nos apps atuais, `authObservability` em `src/lib/observability.ts` transforma audit em breadcrumbs Sentry usando `payloadKeys` em vez de payload bruto.

A função `logAuditEvent` é **re-exportada do root** (`import { logAuditEvent } from "@informach/auth"`) para que outros packages do monorepo (`@informach/billing`, `@informach/emails`) possam wirar `config.onAudit` callback sem importar de sub-paths internos. Apps tipicamente fazem:

```ts
// apps/<app>/src/lib/billing.ts
createBillingService({
  // ...
  onAudit: (event) => {
    logAuditEvent(event.eventType, event.actorId, event.payload).catch(/* fire-and-forget */);
  },
});
```

Os audit types `billing.*` e `email.*` são gerenciados pelos packages `@informach/billing` e `@informach/emails`, mas declarados aqui na union `AuditEventType` — qualquer novo tipo precisa ser adicionado a `audit.ts` E à tabela acima.

Politica de payload/PII: [`docs/audit-payload-policy.md`](../../docs/audit-payload-policy.md). Regra curta: payload minimo, sem secrets/tokens/raw webhooks; eventos `email.*` usam `emailHash`/`emailDomain` em vez de email bruto.

### 3.6 Security events (observability)

`AuthSecurityEventType`: `rate_limit_hit`, `role_mismatch`, `banned_user_signin_attempt`, `two_factor_failed`, `session_revoked`. Atualmente emitidos em runtime: `rate_limit_hit` (status 429 no middleware), `two_factor_failed` (verify-totp/verify-backup-code com status ≥ 400), `session_revoked` (delete em `databaseHooks.session.delete.after`). Os demais types existem para uso futuro.
Nos apps, `authObservability.onSecurityEvent` loga warning no pino e envia `auth.security.<type>` sanitizado para `Sentry.captureMessage`.

### 3.7 Email templates

Templates vivem em `@informach/emails/src/templates/*.tsx` como componentes React Email. O package auth é apenas **caller**: recebe `renderTemplate` na config e chama `await renderTemplate("auth.verify-email", { appName, url, unsubscribeUrl?, unsubscribeMailto? })` no callback de cada feature do Better Auth.

Categorias e componentes:
- `VerificationEmail` — categoria `auth.verify-email`
- `PasswordResetEmail` — categoria `auth.password-reset`
- `MagicLinkEmail` — categoria `auth.magic-link`
- `InvitationEmail` — categoria `auth.invitation` (organizations)
- `AccountDeletionEmail` — categoria `auth.account-deletion`

Snapshots, preview server e checklist visual: `packages/emails/EMAILS.md`.

### 3.8 Account deletion (LGPD) — hooks `onBeforeDelete` / `onAfterDelete`

Quando `accountDeletion: { enabled: true }`, Better Auth ativa o flow de deletion (com email de confirmação se `sendDeleteEmail !== false`). Em adição ao audit log automático (`user.deletion_requested` antes, `user.deleted` depois), apps podem injetar callbacks assíncronos para limpar estado cross-package:

```ts
createAuth({
  // ...
  accountDeletion: {
    enabled: true,
    onBeforeDelete: async (user) => {
      // Cancel billing subscriptions IMEDIATAMENTE (rows ficam por NF-e)
      await billing.cancelBillingForSubject({ type: "user", id: user.id });
      // Anonimizar PII em outras tabelas app-owned, etc.
    },
    onAfterDelete: async (user) => {
      // Notificar sistemas externos, queue jobs de cleanup, etc.
    },
  },
});
```

**Failure handling:** ambos callbacks são try/catch'ed. Erros são gravados em audit (`user.deletion_requested` / `user.deleted` com `payload.{hookError, stage}`) mas NÃO abortam a deletion — LGPD right-to-be-forgotten precisa ser best-effort. Apps que precisam de hard-fail (ex: legal compliance que exija cleanup garantido) devem chamar a operação sensível ANTES de invocar `auth.api.deleteUser`, não no hook.

Casos típicos:
- **`@informach/billing`**: `billing.cancelBillingForSubject` cancela subs ativas (subscription rows + ledger ficam para retenção fiscal).
- **App-owned tables**: anonimizar/deletar registros que referenciam `userId` mas não devem cascatear via FK (preserva dados agregados/históricos sem PII).
- **External systems**: revogar tokens em integrações 3rd-party (Slack, Stripe customer não-billing, etc).

### 3.9 Maintenance (cron-friendly)

`@informach/auth/maintenance` expõe três funções idempotentes que retornam contagem de rows tocadas:

- `cleanupExpiredVerifications(now?)` — `DELETE` em `core.verifications` com `expiresAt < now`.
- `cleanupExpiredInvitations(now?)` — `UPDATE status = 'expired'` em `core.invitations` pending vencidos.
- `cleanupStaleRateLimit(maxAgeSeconds = 3600)` — `DELETE` em `core.rate_limit` com `lastRequest` antigo (no-op quando `secondaryStorage` Redis está ativo).

Apps são responsáveis por expor essas funções via route handler `POST` protegido por `Authorization: Bearer ${CRON_SECRET}` — pattern em `PRODUCTION.md` §7.

### 3.10 Action factory (server actions)

`createActionFactory({ helpers, onAudit? })` retorna `{ action, ok, err, *Error }`. O builder `action` é chainable; `.audit(...)` aceita somente `AuditEventType`, não string livre:

```ts
export const banUser = action
  .input(z.object({ userId: z.string().uuid(), reason: z.string().max(280) }))
  .auth({ require: "role", role: "admin", permission: "users.ban" })
  .rateLimit({ key: "ban-user", max: 5, window: "1h" })
  .audit("user.banned")
  .run(async ({ input, ctx }) => {
    // ctx.actor é o admin autenticado
    await db.update(users).set({ banned: true, banReason: input.reason }).where(eq(users.id, input.userId));
    return ok(null);
  });
```

Ordem de execução: `schema.parse(input) → require* → rateLimit → audit → handler`. `auth.require` aceita `"none" | "user" | "role" | "member-of-org"` (último exige `organizations.enabled`).

`Result<T, E>` é o tipo discriminado retornado pelo handler — `{ ok: true, value }` ou `{ ok: false, error }`. Erros tipados disponíveis: `UnauthorizedError`, `ForbiddenError`, `OrganizationsDisabledError`, `RateLimitError`.

### 3.11 Server helpers (RSC)

`createServerHelpers(authResult, { signInPath?, nextParam? })` envolve `helpers.*` lendo `headers()` do Next:

- `getServerSession()` → session ou null
- `getCurrentUserServer()` → user ou null
- `requireUserServer()` → user ou throw `UnauthorizedError`
- `redirectIfUnauthenticated(next?)` → `redirect()` para `/sign-in?next=...` se anônimo

Importa `server-only` — falha em build se importado de Client Component.

### 3.12 Auth proxy (Next 16 `proxy.ts`)

`createAuthProxy(authResult, { requireAuth?, requireRole?, publicPaths?, signInPath?, nextParam?, forbiddenPath? })` retorna função compatível com Next 16 `proxy.ts` (substitui `middleware.ts`). Faz redirect para sign-in quando user ausente, ou para `forbiddenPath` quando role não bate.

```ts
// apps/<app>/src/proxy.ts
export const proxy = createAuthProxy(authResult, {
  publicPaths: ["/sign-in", "/sign-up", "/verify-email", "/reset-password", "/api/auth"],
  requireAuth: ["/dashboard"],
  requireRole: [{ prefix: "/admin", role: "admin" }],
});
```

> **Não criar `middleware.ts`** — Next 16 deprecated em favor de `proxy.ts` (runtime Node.js, não edge).

---

## 4. Como cada app usa o package

Pattern atual em `apps/agenda-da-turma` (organizations on) e `apps/cozya` (single-user, organizations off). Ambos compartilham a mesma instância de Postgres e schema.

### 4.1 Wire-up obrigatório

```ts
// apps/<app>/src/lib/auth.ts
import { createAuth } from "@informach/auth";
import { createServerHelpers } from "@informach/auth/server";
import { APPS } from "@informach/config";
import { buildUnsubscribeToken } from "@informach/emails";
import { emails } from "./emails";
import { env } from "./env";
import { authObservability } from "./observability";

export const authResult = createAuth({
  appName: APPS.<app>.name,
  baseUrl: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  buildUnsubscribeUrl: (id, category) => {
    const t = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, id, category);
    return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${t}`;
  },
  unsubscribeMailto: `unsubscribe@${new URL(env.NEXT_PUBLIC_APP_URL).hostname}`,
  observability: authObservability,
  // opt-ins por app:
  organizations: { enabled: true },               // só agenda-da-turma
  socialProviders: googleProvider ? { google: googleProvider } : undefined,
  // passkey: { enabled: true },
  // twoFactor: { enabled: true },
});

export const {
  auth, getCurrentUser, requireUser, getSession,
  requireRole, requireAdmin, hasRole, assertRole, assertPermission,
} = authResult;

export const { getServerSession, requireUserServer, redirectIfUnauthenticated } =
  createServerHelpers(authResult);
```

```ts
// apps/<app>/src/lib/auth-client.ts
import { createInformachAuthClient } from "@informach/auth/client";
import { env } from "./env";

export const authClient = createInformachAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  organizations: true,  // opt-ins espelham auth.ts
  // passkey: true,
  // twoFactor: { onRedirect: () => router.push("/two-factor") },
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

```ts
// apps/<app>/src/lib/action.ts
import { createActionFactory } from "@informach/auth/server-actions";
import { authResult } from "./auth";
import { logger } from "./logger";

export const { action, ok, err } = createActionFactory({
  helpers: authResult,
  onAudit: ({ eventType, actorId }) => logger.info({ eventType, actorId }, "action.invoke"),
});
```

```ts
// apps/<app>/src/app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";

export async function GET(request: Request) { return auth.handler(request); }
export async function POST(request: Request) { return auth.handler(request); }
```

```ts
// apps/<app>/src/proxy.ts
import { createAuthProxy } from "@informach/auth/proxy";
import { authResult } from "./lib/auth";

export const proxy = createAuthProxy(authResult, {
  publicPaths: ["/sign-in", "/sign-up", "/verify-email", "/reset-password", "/api/auth"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

export default proxy;
```

### 4.2 Env vars consumidas pelo app

O package **não lê env**. O app é responsável por validar com Zod e passar para `createAuth({...})`. Mínimo:

| Var | Uso |
|---|---|
| `BETTER_AUTH_SECRET` | `secret` (≥32 chars, `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `baseUrl` (HTTPS em prod) |
| `NEXT_PUBLIC_APP_URL` | `trustedOrigins`, unsubscribe URL |
| `DATABASE_URL` | usado por `@informach/db` (compartilhado) |
| `SENDGRID_*` | usado por `@informach/emails` |
| `CRON_SECRET` | jobs de manutenção |
| `GOOGLE_CLIENT_ID/SECRET` | (opcional) Google OAuth |

Wiring real em `apps/<app>/src/lib/env.ts` (`@t3-oss/env-nextjs`).

---

## 5. Arquitetura e design

### 5.1 Decisões fixadas

1. **Better Auth como dependency real, não fork.** Versões `better-auth` e `@better-auth/passkey` pinadas em `1.6.9` exato (sem caret) em `package.json`. Subir versão exige rodar testes + typecheck, ler release notes, atualizar este doc.
2. **RBAC custom, não plugin `admin()`.** O plugin oficial expõe endpoints `/admin/*` (impersonate, ban, list-users) que não foram pedidos como produto e expandem superfície de ataque. Implementação custom em `permissions.ts` + `helpers.ts` cobre o caso atual.
3. **Multi-tenancy via `organization` é opt-in por app, não global.** `agenda-da-turma` ativa (escola → professores). `cozya` não ativa (single-user). Forçar plugin no client/schema dos dois custaria 3 tabelas e middleware sem ganho.
4. **Schema source of truth é Drizzle (`packages/db/src/schema/core.ts`), não Better Auth CLI.** Misturar `npx better-auth migrate` com `drizzle-kit generate` causa conflitos. Quando Better Auth 1.x adiciona `additionalFields` ou plugin novo, declaramos manualmente em `core.ts` e mapeamos via `schema:` no `drizzleAdapter`.
5. **Cookie cache 5min default.** Balanceia performance (evita DB hit por request) com latência de revogação aceitável. Para revogação imediata após ban/role-change, chamar `auth.api.signOutAllSessions({ userId })` manualmente. Apps com necessidade de tempo real passam `session.cookieCache.maxAge` menor.
6. **`proxy.ts` (Next 16), não `middleware.ts`.** Next 16 deprecated middleware em favor de proxy (runtime Node.js). Codename do package: `createAuthProxy` em `@informach/auth/proxy`.
7. **`server-only` em proxy/server/server-actions.** Garante que importação de Client Component falha em build.
8. **Audit pipeline try/catch'ed.** Falha em `observability.onAuditEvent`/`onSecurityEvent` ou em INSERT no `audit.events` não pode quebrar fluxo de auth — todos os emits estão dentro de try/catch. Falha de INSERT deve chamar `onAuditPersistenceFailure` com erro sanitizado.
9. **Cadastro público continua aberto.** `requireEmailVerification: true` é o gate. `disableSignup` está exposto na config como infraestrutura para o futuro. Magic-link cria users na primeira ocorrência (limitação 1.x, comentada em `index.ts`).

### 5.2 Sub-paths do package (`exports` em `package.json`)

| Sub-path | Conteúdo | Importa de? |
|---|---|---|
| `@informach/auth` | `createAuth`, tipos `Role`/`Permission`/`AuditEventType`, errors, `PERMISSIONS`, `roleHasPermission` | server/RSC/route-handlers |
| `@informach/auth/client` | `createInformachAuthClient` (React) | client components |
| `@informach/auth/server` | `createServerHelpers` (RSC) | RSC + server actions |
| `@informach/auth/proxy` | `createAuthProxy` | `apps/<app>/src/proxy.ts` |
| `@informach/auth/server-actions` | `createActionFactory`, `Result`, `ok`/`err` | server actions |
| `@informach/auth/maintenance` | `cleanup*` funções | route handlers de cron job |

### 5.3 Tipos exportados

`User` e `Session` são inferidos via `AuthInstance["$Infer"]["Session"]` — o app **não declara** tipos próprios para isso, importa do package. Quando adicionar `additionalFields`, Better Auth atualiza o `$Infer` automaticamente.

---

## 6. Testes

184+ testes em `src/__tests__/` rodando via `pnpm --filter @informach/auth test`:

| Arquivo | Cobertura |
|---|---|
| `create-auth.test.ts` | Factory: defaults, opt-ins, plugins habilitados condicionalmente |
| `helpers.test.ts` | `requireUser/Role`, `assertPermission`, helpers de organization |
| `permissions.test.ts` | Matrix de roles × permissions, `roleHasPermission` |
| `proxy.test.ts` | Path matching, redirects sign-in/forbidden, role enforcement |
| `server.test.ts` | RSC helpers + redirect flow |
| `server-actions.test.ts` | Action builder: schema parse, auth, rate limit, audit, errors |
| `maintenance.test.ts` | Cleanup queries (mocks de drizzle) |

Snapshots dos templates de email vivem em `@informach/emails/src/__tests__/templates.test.tsx` (foram movidos junto com a migração para React Email).

Apps **não rodam estes testes** — fica isolado no package. Para teste E2E real (sign-up + verify), usar Playwright nos apps (`apps/<app>/e2e/`). Além disso, apps que conectam auth/billing/emails mantêm testes próprios de wiring para travar `observability` e `onAudit`.

---

## 7. Regras para agentes

Quando trabalhar neste package:

1. **Antes de mexer em qualquer coisa que toque Better Auth API**, consultar `context7` ou `mcp__context7__query-docs` com a versão `1.6.9` — a API muda entre minor versions.
2. **Não habilitar nenhuma feature opt-in sem confirmar com o usuário.** Cada feature carrega custo de schema/middleware/UI. Default é off.
3. **Nunca quebrar tipos exportados** sem upgrade major do package — `User`, `Session`, `Role`, `Permission`, `AuditEventType` são consumidos pelos apps.
4. **Schema novo ou mudança em coluna?** Editar `packages/db/src/schema/core.ts`, gerar migration via `pnpm db:generate`, mapear no `drizzleAdapter` em `index.ts`. Nunca rodar `npx better-auth migrate`.
5. **Templates de email**: qualquer mudança visual quebra snapshot — atualizar **só depois** de rodar checklist de `EMAILS.md`. Snapshots existem para forçar review.
6. **Audit/security hooks devem permanecer try/catch'ed** — auth não pode cair se o APM cair.
7. **Não emitir eventos de audit fora de `logAuditEvent`** — caso contrário `observability.onAuditEvent` não recebe.
8. **Mudanças na matriz de permissions** (`PERMISSIONS` em `permissions.ts`): atualizar tabela em §3.3 deste doc + testes em `permissions.test.ts`.
9. **Adicionar plugin Better Auth novo** = tarefa em fase própria. Ordem: schema (Drizzle) → tipos no `CreateAuthConfig` → wire em `buildPlugins` → client equivalente em `client.ts` → testes → este doc + `PRODUCTION.md`.
10. **Versão pinada** (`better-auth@1.6.9`): subir é decisão consciente. Sempre rodar `pnpm --filter @informach/auth test && pnpm --filter @informach/auth typecheck` antes de aplicar.

---

## 8. Próximos passos potenciais (fora do escopo atual)

Itens validados como possíveis evoluções, sem compromisso de prioridade:

- UI de auth nos apps (sign-in/sign-up/reset-password/verify-email pages — hoje só os endpoints existem).
- `hasAccessToProduct(userId, productId)` está stubbed com `NotImplementedError` — esperando o package `@informach/billing` materializar.
- Helpers SSO cross-subdomain (depende de domínio custom + cookie domain config).
- I18n dos templates de email — infra pronta em `@informach/emails` (default `pt-BR`); falta apenas adicionar locales adicionais em `messages/<locale>.json` quando o produto pedir.
- Plugin `admin()` oficial (se algum dia precisar de impersonation com UI pronta).

Para retomar trabalho de fase, perguntar ao usuário qual fase está autorizada — cada fase é entregável independente. Histórico de fases entregues vive na memory (`auth_roadmap.md`).
