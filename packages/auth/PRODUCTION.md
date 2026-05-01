# `@informach/auth` — checklist de produção

Tópicos que estão **fora do escopo do package** mas são pré-requisito para subir o auth com segurança em produção.

---

## 1. CSP / security headers

O package não emite headers de resposta — isso é responsabilidade do `next.config.ts` ou do `proxy.ts` do app. Mínimo recomendado:

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'", // ajuste para usar nonce em produção
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

CSP com `'unsafe-inline'` é apenas o ponto de partida — substituir por nonce ou hash quando estabilizar a stack de scripts. Doc oficial: <https://nextjs.org/docs/app/api-reference/config/next-config-js/headers>.

> **Railway TLS:** o edge proxy do Railway termina TLS — a app recebe HTTP no `$PORT`. `Strict-Transport-Security` continua valendo a pena (browser-side). Confirme `BETTER_AUTH_URL=https://<dominio-custom>` em produção para que Better Auth gere cookies com `secure: true` e o `trustedOrigins` valide o esquema correto.

---

## 2. CORS / `trustedOrigins` multi-domain

Better Auth não aceita wildcards — liste cada origem concreta em `CreateAuthConfig.trustedOrigins`:

```ts
const prodOrigins = [
  "https://agenda.informach.com.br",
  "https://cozya.informach.com.br",
];

createAuth({
  // ...
  trustedOrigins:
    process.env.RAILWAY_ENVIRONMENT_NAME === "production"
      ? prodOrigins
      : [
          // Railway popula RAILWAY_PUBLIC_DOMAIN automaticamente em PR/staging
          // (ex.: agenda-da-turma-pr-42.up.railway.app), sem precisar gerar
          // a lista em build time.
          `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`,
          ...prodOrigins,
        ],
});
```

> **Cookies cross-subdomain em `*.up.railway.app` não funcionam** — o domínio é da Public Suffix List, browsers recusam `Set-Cookie; Domain=.up.railway.app`. Para SSO entre `agenda` e `cozya` (se algum dia precisar), produção **exige** domínio custom (`*.informach.com.br`) configurado via Railway → Service → Settings → Networking. PR previews ficam isolados por design.

---

## 3. Redis / `secondaryStorage`

Em produção sob carga, mover sessions/verifications/rate-limits do Postgres para Redis reduz latência e evita gargalo. O package aceita qualquer `SecondaryStorage` compatível com a interface do Better Auth — não inclui adapter pronto.

**Setup no Railway:**

1. Adicionar o template **Redis** ao project (`+ New → Database → Redis`).
2. Em cada service de app, referenciar via `REDIS_URL=${{Redis.REDIS_PRIVATE_URL}}?family=0`.
   - O sufixo `?family=0` é **obrigatório** — a rede privada do Railway é IPv6-only e o ioredis assume IPv4 por padrão. Sem `family=0`, conexão falha com `ENOTFOUND redis.railway.internal`.
   - Use `REDIS_PRIVATE_URL` (não `REDIS_URL`) para evitar tráfego pelo edge público — não tem TLS no privado, mas é interno ao project.
3. Instalar `ioredis` no app: `pnpm --filter @informach/<app> add ioredis`.

```ts
// apps/<app>/src/lib/redis.ts
import IORedis from "ioredis";
import { env } from "./env";

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
});
```

```ts
// apps/<app>/src/lib/redis-storage.ts
import type { SecondaryStorage } from "@informach/auth";
import { redis } from "./redis";

export const redisSecondaryStorage: SecondaryStorage = {
  async get(key) {
    const value = await redis.get(key);
    return value ?? null;
  },
  async set(key, value, ttl) {
    const stringValue = typeof value === "string" ? value : JSON.stringify(value);
    if (ttl) await redis.set(key, stringValue, "EX", ttl);
    else await redis.set(key, stringValue);
  },
  async delete(key) {
    await redis.del(key);
  },
};
```

```ts
// apps/<app>/src/lib/auth.ts
import { createAuth } from "@informach/auth";
import { redisSecondaryStorage } from "./redis-storage";

createAuth({
  // ...
  secondaryStorage: redisSecondaryStorage,
});
```

Alternativa pronta: `@better-auth/redis-storage` (oficial Better Auth) elimina o boilerplate do adapter — `pnpm add @better-auth/redis-storage` e wire `secondaryStorage: redisStorage(redis)`. Compatível com o `better-auth@1.6.9` pinado no package.

Quando `secondaryStorage` é fornecido, o package automaticamente seta `rateLimit.storage = "secondary-storage"`. Sessions deixam o Postgres a menos que você force `session.storeSessionInDatabase: true` (não exposto pelo package por enquanto — abrir issue se precisar).

---

## 4. Rate limit best-practices

Os defaults do package já são endurecidos contra enumeration:

| Endpoint | Window | Max |
|---|---|---|
| `/sign-in/email` | 60s | 5 |
| `/sign-up/email` | 1h | 5 |
| `/forget-password` | 1h | 3 |
| `/sign-in/magic-link` | 10min | 5 |
| `/verify-email` | 60s | 10 |
| `/reset-password` | 1h | 5 |

Para afrouxar em dev/test (ex.: rodar Playwright sem pegar 429 em forget-password):

```ts
createAuth({
  // ...
  rateLimitRules:
    process.env.NODE_ENV === "production"
      ? undefined
      : { "/forget-password": { window: 60, max: 100 } },
});
```

---

## 5. Account deletion / LGPD

Habilitar o fluxo nativo do Better Auth via:

```ts
createAuth({
  // ...
  accountDeletion: {
    enabled: true,
    sendDeleteEmail: true, // exige confirmação por email antes de deletar
  },
});
```

Quando ativo:
- O endpoint `DELETE /api/auth/delete-user` fica disponível.
- Se `sendDeleteEmail: true`, o usuário recebe email com link de confirmação (categoria `auth.account-deletion`).
- Audit log emite `user.deletion_requested` antes e `user.deleted` depois.
- FKs `ON DELETE CASCADE` em `core.{sessions,accounts,members,passkeys,two_factors}` garantem cleanup automático.

UI do app deve confirmar duas vezes ("Tem certeza? Esta ação é irreversível.") antes de chamar `authClient.deleteUser()`.

---

## 5b. Convite duplicado / unique members

A tabela `core.members` tem `uniqueIndex("members_user_org_uniq").on(userId, organizationId)`. Better Auth trata duplicatas via error code tipado — `USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION` é retornado pelo `acceptInvitation`/`addMember` quando o user já existe na org. **Não vai vazar `unique_violation` do PG para o cliente.** Essa garantia foi confirmada em `node_modules/better-auth/dist/plugins/organization/error-codes.mjs` na versão pinada (1.6.9).

UI deve tratar esse error code como sucesso idempotente (user já está dentro) ou exibir mensagem informativa, depende do fluxo.

## 6. 2FA recovery

Quando `twoFactor: { enabled: true }`, os endpoints abaixo ficam disponíveis:

| Endpoint | Para que serve |
|---|---|
| `POST /two-factor/enable` | Habilita 2FA, retorna `totpURI` (QR) e `backupCodes` |
| `POST /two-factor/disable` | Desabilita 2FA (exige password) |
| `POST /two-factor/verify-totp` | Verifica código do authenticator app |
| `POST /two-factor/verify-backup-code` | Recovery via backup code (consome o código) |
| `POST /two-factor/generate-backup-codes` | Regenera os 10 backup codes |

Audit log cobre todos (`auth.two_factor_enabled/disabled/verified`, `auth.backup_code_used`). `backup_code_used` também emite `onSecurityEvent` para monitoramento.

Procedimento de recovery quando o usuário perdeu acesso ao TOTP **e** aos backup codes:
1. Admin valida identidade fora do app (suporte/CAC).
2. Admin executa SQL:
   ```sql
   UPDATE core.users SET two_factor_enabled = false WHERE id = '<user-id>';
   DELETE FROM core.two_factors WHERE user_id = '<user-id>';
   ```
3. Audit em `audit.events` registra a SQL via metadata externa do admin (não há hook automático para esse caminho).
4. Usuário re-habilita 2FA na próxima sessão.

---

## 7. Cleanup periódico

O package expõe funções idempotentes em `@informach/auth/maintenance`:

```ts
import {
  cleanupExpiredVerifications,
  cleanupExpiredInvitations,
  cleanupStaleRateLimit,
} from "@informach/auth/maintenance";
```

**TODO operador:** essas funções **ainda não estão expostas** via route handler nos apps. Crie `apps/<app>/src/app/api/jobs/auth-cleanup/route.ts` espelhando o pattern de `apps/<app>/src/app/api/jobs/email-recover-stale/route.ts`:

```ts
// apps/<app>/src/app/api/jobs/auth-cleanup/route.ts
import {
  cleanupExpiredInvitations,
  cleanupExpiredVerifications,
  cleanupStaleRateLimit,
} from "@informach/auth/maintenance";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const verifications = await cleanupExpiredVerifications();
  const invitations = await cleanupExpiredInvitations();
  const rateLimit = await cleanupStaleRateLimit(3600);
  return Response.json({ verifications, invitations, rateLimit });
}
```

**Wire-up no Railway:** o Cron Schedule do Railway executa o **start command** de um service no horário e exige que o processo termine — não é um agendador HTTP nativo. Pattern usado neste repo: um service mínimo (`cron-runner`, imagem `alpine` + `curl`) por job, cuja Cron Schedule é configurada em Service Settings → Cron Schedule e cujo start command é um `curl` no endpoint protegido por `CRON_SECRET`:

```sh
# start command do service cron-runner-auth-cleanup
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://${APP_URL}/api/jobs/auth-cleanup"
```

Schedules sugeridos (UTC, mínimo 5min entre execuções):

| Job | Cron | Endpoint |
|---|---|---|
| `auth-cleanup` (verifications + invitations + stale rate limit) | `0 4 * * *` | `/api/jobs/auth-cleanup` |
| `email-retry` | `*/5 * * * *` | `/api/jobs/email-retry` |
| `email-recover-stale` | `*/30 * * * *` | `/api/jobs/email-recover-stale` |
| `email-suppression-sync` | `0 5 * * *` | `/api/jobs/email-suppression-sync` |

Se já há `secondaryStorage` (Redis), o `cleanupStaleRateLimit` vira no-op — Redis faz TTL nativamente. As outras duas continuam necessárias (rodam contra Postgres).

---

## 8. Observability

Plug seu APM via `observability` callbacks:

```ts
import * as Sentry from "@sentry/nextjs";

createAuth({
  // ...
  observability: {
    onAuditEvent(event) {
      // Sentry breadcrumbs, OpenTelemetry span, etc.
      Sentry.addBreadcrumb({
        category: "auth.audit",
        message: event.eventType,
        data: { actorId: event.actorId, ...event.payload },
        level: "info",
      });
    },
    onSecurityEvent(event) {
      Sentry.captureMessage(`auth.security.${event.type}`, {
        level: "warning",
        extra: { userId: event.userId, ...event.metadata },
      });
    },
  },
});
```

Eventos atualmente emitidos:
- `session_revoked` em `databaseHooks.session.delete.after`.
- `rate_limit_hit` quando middleware vê status 429 retornado.
- (Reservado para futuro: `role_mismatch`, `banned_user_signin_attempt`, `two_factor_failed`.)

Hooks são `try/catch`-ed internamente — se sua APM cair, o auth não cai junto.

---

## 9. Email validation manual

Templates HTML (`*EmailHtml`) são minimalistas e estão cobertos por inline snapshots em `templates.test.ts`. Antes de promover qualquer mudança para produção, validar visualmente em pelo menos:

- Gmail (web + mobile)
- Outlook (Windows desktop, web)
- Apple Mail
- Modo escuro de cada cliente

Ferramentas recomendadas: [Litmus](https://litmus.com), [Email on Acid](https://www.emailonacid.com), ou contas pessoais de teste. Veja `EMAILS.md` para o checklist completo.

---

## 10. Pin de versões

`better-auth` e `@better-auth/passkey` estão pinados em `1.6.9` exato (sem caret) em `package.json`. Subir versão é decisão consciente — checar release notes e rodar `pnpm test && pnpm typecheck` antes de aplicar.

---

## 11. Topologia Railway (resumo de wiring)

Checklist do que precisa existir no project Railway antes do primeiro deploy. Detalhes específicos das seções 2/3/7 acima.

### Services

| Service | Tipo | Notas |
|---|---|---|
| `agenda-da-turma` | Next.js (deploy from repo) | rootDirectory `apps/agenda-da-turma`, build `pnpm install --frozen-lockfile && pnpm build:agenda-da-turma`, start `pnpm start:agenda-da-turma`. `output: "standalone"` já em `next.config.ts`. |
| `cozya` | Next.js (deploy from repo) | Análogo: build `pnpm build:cozya`, start `pnpm start:cozya`. |
| `Postgres` | Database template | Fornece `${{Postgres.DATABASE_URL}}` referenciável pelos apps. Migrations rodam via job manual ou hook de release (`pnpm db:migrate`). |
| `Redis` (opcional) | Database template | Fornece `${{Redis.REDIS_PRIVATE_URL}}`. Necessário só se ativar `secondaryStorage` (seção 3). |
| `cron-runner-*` (1 por job) | Cron Schedule | Imagem `alpine/curl` + start command com `curl` no endpoint HTTP. Ver seção 7. |

### Env vars por app (delta vs `apps/<app>/.env.example`)

| Var | Valor produção | Notas |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference variable do Railway. |
| `BETTER_AUTH_URL` | `https://<dominio-custom>` | **Obrigatório HTTPS** (define `secure` cookies). Não usar `.up.railway.app` em prod. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | Secret manual. |
| `NEXT_PUBLIC_APP_URL` | `https://<dominio-custom>` | Mesmo valor de `BETTER_AUTH_URL`. |
| `CRON_SECRET` | `openssl rand -base64 32` | Compartilhado entre o app e o `cron-runner` correspondente. |
| `SENDGRID_API_KEY`, `SENDGRID_FROM`, `SENDGRID_WEBHOOK_PUBLIC_KEY` | — | Por app. |
| `EMAIL_SANDBOX_MODE` | `live` | Default `live` em prod. |
| `REDIS_URL` | `${{Redis.REDIS_PRIVATE_URL}}?family=0` | Só se `secondaryStorage` ativo. |
| `GOOGLE_CLIENT_ID`/`SECRET` | — | Opcional — Google OAuth ativa quando ambos definidos. |
| `SENTRY_DSN` | — | Opcional. |

### Domínio custom

- Cada app deve ter um domínio custom (ex.: `agenda.informach.com.br`, `cozya.informach.com.br`) configurado em **Service → Settings → Networking → Custom Domain**. CNAME DNS apontando para o domínio Railway sugerido.
- Mesmo domínio raiz (`*.informach.com.br`) é pré-requisito de SendGrid Domain Authentication (`mail.informach.com.br`) — ver `next-steps.txt`.

### Healthcheck

- Path `/` ou `/api/health` (criar se quiser distinção) em **Service → Settings → Healthcheck**. Failsafe: timeout 30s, restart on failure.

### Migrations

- Não há job pronto. Após deploy, rodar manualmente via `railway run --service Postgres -- pnpm db:migrate` ou um service `migrator` one-off com start command `pnpm db:migrate`. Nunca incluir migration no build do app — quebra rollback.
