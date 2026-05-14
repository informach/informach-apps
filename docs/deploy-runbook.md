# Runbook — Deploy de app no Railway

Passo-a-passo reproduzível, baseado no deploy real do `@informach/cozya` (2026-05-09) e replicado em `@informach/agenda-da-turma` (2026-05-14, em `agenda-da-turma.informach.com.br`). Documenta o que rodou via **Stripe MCP**, **Sentry MCP**, **Railway MCP/CLI** e o que precisou ser **manual no Dashboard**, com os gotchas que custaram tempo na primeira vez.

> **Como usar para um novo app** (admin, informach-site futuros): pular as fases marcadas **♻ reusa** quando a infra correspondente já existir (Postgres, Redis, Migrator, conta Stripe, conta SendGrid, etc.); seguir as fases **🆕 per-app** sempre.

---

## TL;DR — quem faz o quê

| Fase | Etapa | Como | Reusa entre apps? |
|---|---|---|---|
| 1.1 | Stripe live activation | Manual Dashboard | ♻ 1× por conta |
| 1.2 | Privacy + Terms URLs | Manual Dashboard | ♻ 1× por conta |
| 1.3 | Live Products + Prices | **Stripe MCP** (`stripe_api_execute`) | 🆕 per-app |
| 1.4 | Test mode Products + Prices | One-shot tsx script | 🆕 per-app |
| 1.5 | Restricted API key | Manual Dashboard (REST API não expõe) | 🆕 per-app |
| 1.6 | Customer Portal config | Manual Dashboard | ♻ 1× por conta |
| 2.x | SendGrid (domain, webhook, key, from) | Manual Dashboard | ♻ 1× por conta |
| 3.1 | Railway project | Manual Dashboard ("Deploy from GitHub") | ♻ 1× por monorepo |
| 3.2 | Postgres + Redis | Manual Dashboard (parte do project setup) | ♻ 1× por monorepo |
| 3.3 | App service config | `apps/<app>/railway.toml` + 1 click Config Path | 🆕 per-app |
| 4.1 | Postgres validation | **Railway MCP** (`list-deployments`, `list-variables`) | ♻ |
| 4.2 | Redis IPv6 quirk | **Railway MCP** (set `?family=0`) | ♻ |
| 4.3 | Migrator service | Manual Empty Service + Config Path | ♻ 1× por monorepo |
| 5.x | Env vars (per-app service) | **Railway MCP** `set-variables` (batch) + manual secrets | 🆕 per-app |
| 5.3 | Sentry project + DSN | **Sentry MCP** (`create_project`) | 🆕 per-app |
| 5.3 | Sentry auth token | Manual Sentry UI (UI-only por segurança) | ♻ pode reusar org-scoped |
| 6.1 | Custom domain (Railway) | Manual Dashboard | 🆕 per-app |
| 6.2 | DNS (Cloudflare) | Manual Cloudflare | 🆕 per-app |
| 7 | Price IDs em `packages/config/src/products.ts` | Manual edit + commit | 🆕 per-app |
| 8 | First deploy | Auto via push | 🆕 per-app |
| 9 | Migrations + seed | Migrator redeploy + verify | ♻ 1× por monorepo |
| 10 | Stripe Webhook | Manual Dashboard (Stripe + Railway) | 🆕 per-app |
| 11 | Cron services (9 total) | **Railway CLI** (`railway add --image`) + Manual Dashboard (cron schedule, start cmd) | ♻ ADD domain em APP_DOMAINS — não criar novos services |

---

## Pré-requisitos (1× por monorepo)

Antes do primeiro app:

- [ ] Conta Stripe live ativada (CNPJ, dados bancários BR)
- [ ] Conta SendGrid com Domain Authentication + Signed Event Webhook
- [ ] Conta Cloudflare (ou outro DNS) com domínio raiz `informach.com.br`
- [ ] Conta Railway (Pro plan recomendado pra produção)
- [ ] Conta Sentry com 1 organization
- [ ] Railway CLI instalado e autenticado: `npm i -g @railway/cli && railway login` (em terminal próprio com browser, não subprocess)
- [ ] Repo conectado ao Railway via GitHub App authorization

---

## Fase 1 — Stripe (Products + Prices + key + portal)

### 1.1–1.2 Account-level (Manual Dashboard, 1×)

- Settings → Business settings → Public details (logo, suporte)
- Settings → Account details → Statement descriptor (≤22 chars, ex.: `INFORMACH PLT`)
- Settings → Public details → Privacy + Terms URLs apontando pra `informach.com.br/{privacidade,termos}`

### 1.3 Live Products + Prices via Stripe MCP

**Modelagem idiomática Stripe**: 1 Product por "thing", N Prices por variante. Para um app SaaS com cadência mensal/anual + credit packs:

- Product 1: `<App> Pro` (subscription) → 2 Prices (mensal + anual)
- Product 2: `<App> Créditos` (one-time) → 3 Prices (10/20/30 packs)

**Sequência**:

```
mcp__stripe__stripe_api_execute (PostProducts) → cria Product 1 + 2
mcp__stripe__stripe_api_execute (PostPrices)   → cria 5 Prices apontando pros 2 Products
mcp__stripe__list_prices (read-only verify)
```

**Campos de interesse no PostProducts**:
- `name`, `description` (marketing copy)
- `tax_code: "txcd_10000000"` (General Services, BR não usa Stripe Tax mas convém ter)
- `metadata.app = "<slug>"`, `metadata.kind = "subscription" | "credit_pack"`
- `images: ["<file-link-url>"]` (opcional, ver §1.3.1)

**Campos no PostPrices**:
- `currency: "brl"`, `unit_amount` em centavos (1490 = R$ 14,90)
- `recurring: { interval: "month" | "year" }` (subscription) ou omitido (one-time)
- `tax_behavior: "inclusive"` (BR — preço final ao consumidor)
- `nickname: "..."` (label no Dashboard, não exposto ao cliente)
- `metadata.product_id` = bate 1:1 com `Product.id` interno em `packages/config/src/products.ts`

#### 1.3.1 Logo nos products (opcional)

Stripe products aceitam `images: string[]` (URLs HTTPS), não upload direto. Caminhos:

- **Stripe Files API + FileLink**: upload PNG via `stripe.files.create({ purpose: 'product_image' })` → `stripe.fileLinks.create({ file })` retorna URL permanente. **Multipart upload não funciona via MCP** — precisa one-shot tsx ou upload manual no Dashboard depois.
- **URL pública existente**: se app já está deployed em algum lugar, pode usar `https://<domain>/logo.png`.
- **Pular**: rely no branding de conta (Settings → Branding) que aparece no header do Checkout.

**Cozya escolheu**: pular product images + upload manual no Dashboard depois (decisão de produto).

### 1.4 Test mode Products + Prices

⚠ **Stripe MCP fica fixado em 1 mode por sessão** (a chave configurada). Pra criar em test mode, escolher 1:

- **(a) Trocar a key do MCP** pra `sk_test_*` no config local + restart Claude Code
- **(b) Rodar one-shot tsx script** com `sk_test_*` do `apps/<app>/.env.local`. **Caminho usado pelo cozya** — script vivia em `packages/billing/scripts/setup-cozya-test-credit-packs.ts` (deletado pós-execução). Pattern: lê `STRIPE_SECRET_KEY` do env, cria Product + 3 Prices, imprime IDs.

Em ambos casos, mirror exato dos products live (mesma description/metadata).

### 1.5 Restricted API key (Manual)

Stripe REST API **não expõe** criação de restricted keys (UI-only por segurança). No Dashboard live mode:

1. https://dashboard.stripe.com/apikeys/create
2. Permissões mínimas (ver `packages/billing/PRODUCTION.md` §6.1):
   - Customers: R+W
   - Checkout Sessions: W
   - Customer Portal: W
   - Subscriptions: R+W
   - Payment Intents: R
   - Charges: R
   - Invoices: R
   - Webhook endpoints: R
   - Tudo o resto: None
3. Copiar `rk_live_*` (mostrado 1×). Vai como `STRIPE_SECRET_KEY` na Fase 5.

> **Gotcha**: o `apps/<app>/src/lib/env.ts` precisa aceitar `rk_*` E `sk_*`. Se ainda só aceita `sk_`, vai quebrar no Zod boot. Cozya foi corrigida no commit `28f36f3` (regex `/^(sk|rk)_(test|live)_/`).

### 1.6 Customer Portal (Manual, 1× por conta)

Settings → Billing → Customer portal → Configure (live + test). Habilita: update email/payment, view invoices, cancel (at period end). **Switch plans: OFF** inicialmente.

---

## Fase 2 — SendGrid (Manual, ♻ 1× por conta)

Não há MCP do SendGrid. Tudo Dashboard:

- 2.1 **Domain Authentication** (DKIM/SPF/DMARC) pro domínio raiz que vai mandar email
- 2.2 **Signed Event Webhook** com endpoint apontando pra `https://<app-domain>/api/webhooks/sendgrid` — **1 endpoint por app**, mas configura **só após domain custom estar live**
- 2.3 **API Key** (escopo `Mail Send` + `Suppressions`)
- 2.4 **From address** verificada (ex.: `no-reply@<authenticated-domain>`)

> **Gotcha**: se `SENDGRID_FROM` for de um domínio diferente do app domain (ex.: `@casaldevgames.com` em app `cozya.informach.com.br`), DMARC alignment estrito pode rejeitar/spam-folder. Funciona, mas vale alinhar long-term.

---

## Fase 3 — Railway project + service do app

### 3.1 Project (Manual Dashboard, 1× por monorepo)

`railway add --repo <owner>/<repo>` falha com `Unauthorized` em CLI non-interactive (OAuth scope dependency). Caminho real: Dashboard → New Project → **Deploy from GitHub repo** → selecionar repo. Railway auto-detecta o monorepo e cria 1 service por package em `apps/`. Nomes ficam como `@informach/<app>`.

Renomear o project no Dashboard depois (ele gera nomes aleatórios estilo `ideal-dedication`).

### 3.2 Postgres + Redis (Manual Dashboard, 1× por monorepo)

Adicionar como database services no project. Railway gera senhas + URLs automaticamente. Vão ser referenciados via `${{Postgres.DATABASE_URL}}` e `${{Redis.REDIS_URL}}` (ver Fase 4 e 5).

### 3.3 Service do app — config-as-code

Cada app tem um `apps/<app>/railway.toml` versionado. Pattern do cozya:

```toml
# apps/<app>/railway.toml
[build]
builder = "NIXPACKS"
# `--prod=false` força devDeps (turbo, biome, tsx) mesmo com NODE_ENV=production
buildCommand = "pnpm install --frozen-lockfile --prod=false && pnpm build:<app>"

[deploy]
startCommand = "pnpm start:<app>"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**Manual no Dashboard, 1× por service** (CLI/MCP não setam isso):
1. Settings → Source → Root Directory: `/` (raiz do monorepo — pnpm workspaces precisa)
2. Settings → Source → **Config Path**: `apps/<app>/railway.toml`
3. Settings → Networking: **NÃO** clicar Generate Domain (custom domain vem na Fase 6)

> **Gotcha**: cada app tem seu `start:<app>` no root `package.json` (ex.: `start:cozya`). Confirmar que existe antes do primeiro deploy.

> **Gotcha port**: NÃO use `next start -p XXXX` no script `start` do app — Railway injeta `PORT` em runtime. `next start` (sem flag) lê `PORT` automaticamente. Cozya foi corrigida no commit `7cb800c`.

---

## Fase 4 — Postgres + Redis + Migrator

### 4.1 Postgres validation (Railway MCP, read-only)

```
mcp__Railway__list-deployments service=Postgres → status SUCCESS
mcp__Railway__list-variables    service=Postgres → contém DATABASE_URL
```

### 4.2 Redis com `?family=0` (CRÍTICO)

⚠ **Rede privada do Railway é IPv6-only**. `ioredis` (lib usada nos apps) defaulta `family: 4` no DNS lookup → falha com `ENOTFOUND redis.railway.internal`.

**Fix**: na variável do app service, usar reference + suffix:
```
REDIS_URL=${{Redis.REDIS_URL}}?family=0
```

> O sufixo `?family=0` força Node a resolver tanto AAAA (IPv6) quanto A (IPv4).

> **Gotcha naming**: documentação antiga fala de `REDIS_PRIVATE_URL` — esse var **não existe** no template Redis atual. Use `REDIS_URL` (já é privado, aponta pra `redis.railway.internal`).

### 4.3 Migrator service (♻ 1× por monorepo)

Service one-off que roda `pnpm db:migrate && pnpm db:seed && pnpm db:seed:reference` 1× e termina. `pnpm db:migrate` aplica Drizzle e inicializa o storage Mastra (`ai_mastra`) via `PostgresStore.init()`. `pnpm db:seed` popula `billing.credit_pricing`. `pnpm db:seed:reference` popula `agenda.{states, cities, schools}` (IBGE API + `escolas_inep.csv.gz` no repo root). Tudo idempotente — re-deploy quando schema/seed mudar.

**Setup** (Dashboard manual + 1 var via MCP):

1. Dashboard → New → **Empty Service** → name: `migrator`
2. Settings → Source → conectar ao repo
3. Settings → Source → Root Directory: `/`
4. Settings → Source → **Config Path**: `infrastructure/railway/migrator.toml`
5. MCP `set-variables`: `DATABASE_URL=${{Postgres.DATABASE_URL}}`
6. **Watch Paths** (opcional mas recomendado): `packages/db/**`, `packages/ai-core/src/mastra/**`, `packages/ai-core/scripts/**`, `packages/billing/src/seeds/**`, `escolas_inep.csv.gz` — assim só re-deploya quando schema/seed mudar, não a cada push.

```toml
# infrastructure/railway/migrator.toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm install --frozen-lockfile"

[deploy]
startCommand = "pnpm db:migrate && pnpm db:seed && pnpm db:seed:reference"
restartPolicyType = "NEVER"
```

> **Gotcha**: o migrator precisa de `tsx` (devDep) pra rodar `packages/db/src/migrate.ts` e `packages/ai-core/scripts/migrate-mastra-storage.ts`. Como o migrator service NÃO tem `NODE_ENV=production`, devDeps são instaladas por default — funciona sem `--prod=false`. Cozya app, sim, precisa do flag (ver Fase 3.3).

---

## Fase 5 — Variables (per-app service)

### 5.1 Geração local de secrets

Bash/Git Bash:
```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
```

PowerShell:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 5.2 Variables determinísticas (Railway MCP, batch)

```
mcp__Railway__set-variables service=@informach/<app> skipDeploys=true variables=[
  "NODE_ENV=production",
  "DATABASE_URL=${{Postgres.DATABASE_URL}}",
  "REDIS_URL=${{Redis.REDIS_URL}}?family=0",     # CRÍTICO ?family=0
  "BETTER_AUTH_SECRET=<gerado>",
  "BETTER_AUTH_URL=https://<app>.informach.com.br",
  "NEXT_PUBLIC_APP_URL=https://<app>.informach.com.br",
  "CRON_SECRET=<gerado>",
  "STRIPE_MODE=prod",
  "STRIPE_WEBHOOK_SECRET=whsec_PENDING_PHASE_10",  # placeholder até Fase 10
  "EMAIL_SANDBOX_MODE=live",
  "SENDGRID_FROM=no-reply@<authenticated-domain>",
  "LOG_LEVEL=info",
  "MASTRA_LOG_LEVEL=info",
  "OPENROUTER_HTTP_REFERER=https://<app>.informach.com.br",
  "OPENROUTER_X_TITLE=<App>",
  "CSP_ENFORCE=0",  # Somente apps com CSP per-request/report-only; Agenda usa CSP estática em next.config.ts
  "NPM_CONFIG_PRODUCTION=false",  # CRÍTICO — sem isso, turbo+tsc não estão no build
]
```

> **Gotcha NPM_CONFIG_PRODUCTION**: sem essa var, pnpm pula devDeps quando `NODE_ENV=production` → build quebra com `turbo: not found`. Não tem nada a ver com runtime — só install behavior.

> **Gotcha STRIPE_WEBHOOK_SECRET**: o env validator do app exige `whsec_*` prefix. Placeholder `whsec_PENDING_PHASE_10` satisfaz boot. Substitui na Fase 10.

> **Gotcha BETTER_AUTH_URL/NEXT_PUBLIC_APP_URL**: devem ser **HTTPS + custom domain** desde o início (não `*.up.railway.app`). Não há "fallback inicial" que precisa atualizar depois — o cookie + CSP do Better Auth já vêm fechados pro hostname custom.

### 5.3 Secrets (Manual via CLI ou Dashboard — não passa pelo chat)

```powershell
railway variable set "STRIPE_SECRET_KEY=rk_live_..."        --service "@informach/<app>" --skip-deploys
railway variable set "SENDGRID_API_KEY=SG..."                --service "@informach/<app>" --skip-deploys
railway variable set "SENDGRID_WEBHOOK_PUBLIC_KEY=MFkwEw..." --service "@informach/<app>" --skip-deploys
railway variable set "OPENROUTER_API_KEY=sk-or-v1-..."       --service "@informach/<app>" --skip-deploys
railway variable set "SENTRY_AUTH_TOKEN=sntrys_..."          --service "@informach/<app>" --skip-deploys
```

### 5.4 Sentry — project + DSN via MCP, auth token manual

```
mcp__sentry__create_project organizationSlug=<org> teamSlug=<team> name=<app> platform=javascript-nextjs
  → retorna SENTRY_DSN
```

Setar via Railway MCP em batch:
- `SENTRY_DSN=<DSN>`
- `NEXT_PUBLIC_SENTRY_DSN=<mesmo DSN>`
- `SENTRY_ORG=<org-slug>`
- `SENTRY_PROJECT=<app>`

**`SENTRY_AUTH_TOKEN` é UI-only** (Sentry não expõe via API por segurança):
1. https://<org>.sentry.io/settings/auth-tokens/
2. Create New Token → scope `project:releases`
3. Copia `sntrys_*` → `railway variable set` no app

### 5.5 Confirmar `turbo.json` envs

`turbo.json tasks.build.env` enumera as vars que afetam o build (cache invalidation). Ao adicionar nova var build-relevante (lida em runtime via `@t3-oss/env-nextjs`), atualizar lá ou Turbo serve cache stale.

⚠ **Não** todas as vars vão pra `turbo.json` — só as que afetam **output do build**. Não incluir:
- `CSP_ENFORCE` (quando o app usa CSP per-request em proxy.ts; não afeta build output)
- `NPM_CONFIG_PRODUCTION` (afeta install, não build output)

---

## Fase 6 — Custom domain + DNS

### 6.1 Add domain (Manual Railway)

Service `@informach/<app>` → Settings → Networking → Custom Domain → adicionar `<app>.informach.com.br`. Railway dá um CNAME target (ex.: `<service>.up.railway.app`).

### 6.2 DNS no Cloudflare

1. DNS → Records → adicionar CNAME `<app>` → target dado pelo Railway
2. **Proxy status**: 🌫️ **DNS only** (gray cloud) recomendado pra Railway. Proxy do CF gera double-TLS-termination que costuma quebrar com cert origin.
3. **Rules → Redirect Rules / Page Rules**: confirmar que **não há regra wildcard** capturando `*.informach.com.br/*` que redireciona pra outro domínio.

> **Gotcha real do cozya**: havia uma regra wildcard antiga redirecionando `*.informach.com.br` → `informachnucleodeaprendizagem.com`. Subdomain novo retornava 301 antes de chegar no Railway. **Smoke test obrigatório**: `curl -sSL https://<app>.informach.com.br/api/health` — se vier 301 ou cert mismatch, há regra interceptando.

### 6.3 Confirmar BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL

Já setados na Fase 5. Verificar via MCP `list-variables` que estão como `https://<app>.informach.com.br` (HTTPS, sem trailing slash).

---

## Fase 7 — Substituir `price_TODO_*` em `packages/config/src/products.ts`

Editar manualmente: cada Product do app tem `stripePriceId.{ dev, prod }` apontando pros IDs anotados nas Fases 1.3 e 1.4. Commit + push (auto-deploy via watchPath).

**Guard de boot**: o app **falha durante o bootstrap server-side** em produção se algum `price_TODO_*` sobrar (`isStripePriceIdConfigured` rejeita strings com prefix `price_TODO`). Não há como esquecer — boot trava com erro claro.

---

## Fase 8 — First deploy + falhas comuns

Push pra `main` → Railway detecta → service `@informach/<app>` entra em BUILDING → DEPLOYING → SUCCESS.

**Falhas comuns vistas no cozya** (escopo: o app deveria buildar limpo se Phases 1-7 foram OK, mas):

| # | Erro | Causa raiz | Fix |
|---|---|---|---|
| 1 | `SECURITY VULNERABILITIES DETECTED` | Railway scanner pega CVE em dep transitiva (ex.: `next@15.1.2` via `react-email@3.x`) | Bump da dep que puxa a versão antiga |
| 2 | `op ANY/ALL (array) requires array on right side` | `sql\`... = ANY(${jsArr})\`` em Drizzle/postgres-js gera `ANY(($1, $2))` (parameter row, não array) | Usar `inArray()` idiomático do Drizzle |
| 3 | `turbo: not found` | `pnpm install` pulou devDeps com `NODE_ENV=production` | `NPM_CONFIG_PRODUCTION=false` na env do service |
| 4 | `STRIPE_SECRET_KEY must start with 'sk_test_' or 'sk_live_'` | Zod schema não aceitava `rk_*` | Regex `/^(sk\|rk)_(test\|live)_/` em `env.ts` |
| 5 | `STRIPE_WEBHOOK_SECRET: Required` | Placeholder não setado | `whsec_PENDING_PHASE_10` (fix na Fase 10) |
| 6 | `Healthcheck failed (1/1 replicas never became healthy)` | Port hardcode em start script (`next start -p 3002`) | Drop `-p`, Next lê `PORT` env |
| 7 | `getaddrinfo ENOTFOUND redis.railway.internal` (warn durante build) | Build container fora da private network | **Não-blocker** — fallback passthrough do rate-limit absorve. Considerar lazy-init do Redis client futuro pra zerar noise. |
| 8 | `TypeError: Received an instance of Date` (em runtime, primeiro tick do cron) | `sql\`... = ${jsDate}\`` em raw template — postgres-js não serializa Date | `${jsDate.toISOString()}` em todas as ocorrências |

---

## Fase 9 — Verify migrations + seed

Migrator deploy (Fase 4.3) já rodou? Confirmar:

```
mcp__Railway__list-deployments service=migrator → último SUCCESS
mcp__Railway__get-logs        service=migrator logType=deploy → "credit_pricing: 7 inserted"
```

**Verify SQL** (read-only, via tsx + `railway run`):

```bash
# Script one-shot: packages/db/scripts/verify-prod.ts
# Lê DATABASE_PUBLIC_URL injetado pelo railway run --service Postgres
# Valida: 6 schemas, drizzle.__drizzle_migrations rows, billing.credit_pricing rows
```

Pattern do script — `postgres-js` direto (já dep do `@informach/db`), 3 queries simples. Deletar após validar.

---

## Fase 10 — Stripe Webhook (Manual)

1. Stripe Dashboard live → Developers → Webhooks → Add endpoint
2. URL: `https://<app>.informach.com.br/api/webhooks/stripe`
3. Events: `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `payment_intent.succeeded`, `invoice.{paid,payment_failed}` (opcionalmente `charge.refunded`)
4. API version: `2026-04-22.dahlia` (literal — não "Account default")
5. Copiar Signing secret (`whsec_*`)
6. Railway: `railway variable set "STRIPE_WEBHOOK_SECRET=whsec_..." --service "@informach/<app>" --skip-deploys` (substitui o placeholder da Fase 5)
7. Trigger redeploy: `railway redeploy --service "@informach/<app>" --from-source -y`

---

## Fase 11 — Cron services (♻ ADD, não recriar)

**Estratégia híbrida**: 9 services no Railway, INDEPENDENTE de quantos apps. Adicionar app novo = só editar `APP_DOMAINS` nos 7 per-app crons.

### Setup inicial (1× por monorepo)

Criar 9 image-based services via CLI:
```bash
railway add --service cron-perapp-billing-release-reservations --image alpine/curl:latest \
  --variables "CRON_SECRET=<value>" \
  --variables "APP_DOMAINS=cozya.informach.com.br"
# ...repetir pra os outros 6 per-app

railway add --service cron-global-auth-cleanup --image alpine/curl:latest \
  --variables "CRON_SECRET=<value>" \
  --variables "APP_URL=cozya.informach.com.br"
# ...repetir pra cron-global-email-suppression-sync
```

**Manual Dashboard pra cada um dos 9**:
- Settings → Deploy → **Cron Schedule** (cron expression UTC)
- Settings → Deploy → **Start Command** (curl para o endpoint)
- Settings → Deploy → **Restart Policy: Never**
- NÃO setar healthcheck, NÃO Generate Domain

**Tabela completa** (criticidade 🔴/🟡/🟢, escopo 🌐 global ou 🔁 per-app loop):

| Service | Cron (UTC) | Endpoint | Crit | Escopo |
|---|---|---|---|---|
| `cron-perapp-billing-release-reservations` | `*/5 * * * *` | `/api/jobs/billing-release-reservations` | 🔴 | 🔁 |
| `cron-perapp-billing-grant-monthly` | `45 3 * * *` | `/api/jobs/billing-grant-monthly` | 🔴 | 🔁 |
| `cron-perapp-email-retry` | `*/5 * * * *` | `/api/jobs/email-retry` | 🔴 | 🔁 |
| `cron-perapp-billing-dunning` | `0 */6 * * *` | `/api/jobs/billing-dunning` | 🟡 | 🔁 |
| `cron-perapp-billing-reconcile` | `0 3 * * *` | `/api/jobs/billing-reconcile` | 🟡 | 🔁 |
| `cron-perapp-email-recover-stale` | `*/30 * * * *` | `/api/jobs/email-recover-stale` | 🟡 | 🔁 |
| `cron-perapp-billing-expire-bonus` | `30 3 * * *` | `/api/jobs/billing-expire-bonus` | 🟢 | 🔁 |
| `cron-global-auth-cleanup` | `0 4 * * *` | `/api/jobs/auth-cleanup` | 🟢 | 🌐 |
| `cron-global-email-suppression-sync` | `0 5 * * *` | `/api/jobs/email-suppression-sync` | 🟢 | 🌐 |

**Start Command — global** (1 chamada):
```sh
sh -c 'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://${APP_URL}/api/jobs/<endpoint>"'
```

**Start Command — per-app loop** (defesa em profundidade — falha em 1 app não aborta os outros):
```sh
sh -c 'for d in $APP_DOMAINS; do curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://${d}/api/jobs/<endpoint>" || echo "Failed for ${d}, continuing"; done'
```

> **Gotcha shell expansion**: em services image-based (`alpine/curl`) o Start Command precisa chamar `sh -c` quando usa variáveis (`$CRON_SECRET`, `$APP_URL`, `$APP_DOMAINS`). Sem isso, o `curl` recebe literalmente `https://${APP_URL}/...` e falha com `curl: (3) URL rejected: Bad hostname`.

> **Gotcha copy-paste**: tabs em markdown viram múltiplos espaços ao copiar pro Dashboard, e `Authorization: Bearer  $CRON_SECRET` (mais de 1 espaço) falha no `rejectUnauthorizedCron` (strict equality em `lib/cron.ts:4`). **Conferir 1 espaço entre `Bearer` e `$CRON_SECRET`** após colar.

### Adicionar app novo (admin futuro)

**Não criar novos cron services**. Em cada um dos 7 cron-perapp:
1. Settings → Variables → editar `APP_DOMAINS`
2. Adicionar com space-separated: `APP_DOMAINS=cozya.informach.com.br agenda-da-turma.informach.com.br admin.informach.com.br`

Cron schedule, start command, restart policy: **inalterados**. O loop `for d in $APP_DOMAINS` itera os domínios novos automaticamente.

Globais (`auth-cleanup`, `email-suppression-sync`): **nada a fazer**. `APP_URL=cozya.informach.com.br` continua válido — o endpoint opera em schemas compartilhados (`core.users`, `core.email_suppressions`) que cobrem todos os apps com 1 chamada.

---

## Pós-deploy (housekeeping)

### Sentry tunnelRoute (recomendado)

Adicionar em `apps/<app>/next.config.ts`:
```ts
withSentryConfig(nextConfig, {
  // ...
  tunnelRoute: "/monitoring",
  // ...
})
```

Eventos do client tunelados via same-origin (`/monitoring`) em vez de `*.ingest.sentry.io`. Adblockers (uBlock, AdGuard) bloqueiam o domínio Sentry — sem tunnel, perde ~10-30% de erro de users.

### `/api/health` com commit SHA

Handler já implementado em cozya (`apps/cozya/src/app/api/health/route.ts`):
```ts
commit: process.env.GIT_COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? null
```

`RAILWAY_GIT_COMMIT_SHA` é auto-injetado em runtime quando service tá conectado a GitHub. Replicar o pattern em apps novos.

### Smoke test final

```bash
curl -sSL https://<app>.informach.com.br/api/health
# Esperado: {"status":"ok","app":"<app>","commit":"<sha>","timestamp":"..."}
```

Conferir no Sentry (https://<org>.sentry.io/projects/<app>) que não há issues `unresolved firstSeen:-1h` após o boot.

---

## Quick reference: gotchas que custaram tempo no cozya

Em ordem de impacto:

1. **Cloudflare wildcard redirect rule** interceptava o subdomain antes de chegar no Railway. Sem smoke test no DNS, o app fica "no ar" mas inacessível. Sempre `curl https://<domain>/api/health` após DNS propagar.
2. **`?family=0` no REDIS_URL** — IPv6-only network do Railway + ioredis IPv4 default = `ENOTFOUND`. Custou ~30min na primeira vez por não estar documentado claramente.
3. **`NPM_CONFIG_PRODUCTION=false`** — devDeps são necessárias no build (turbo, tsc). Sem isso, build quebra com mensagem misleading "turbo: not found".
4. **`rk_*` na validação STRIPE_SECRET_KEY** — restricted keys são recomendadas pra prod mas o env validator inicial só aceitava `sk_*`.
5. **Port hardcode em `start` script** — `next start -p 3002` ignora `PORT` env do Railway, healthcheck nunca passa. Drop `-p`.
6. **CVE block do Railway scanner** — `next@15.1.2` puxado transitivamente. Bumpar o pacote raiz que puxa a versão vulnerável.
7. **Drizzle SQL `ANY()` array bug** — `sql\`... = ANY(${jsArr})\`` gera SQL inválido. Usar `inArray()`.
8. **postgres-js Date serialization** — `sql\`... = ${jsDate}\`` falha em runtime (não em test com fake-db). Sempre `${jsDate.toISOString()}`.
9. **Tabs viram multi-space ao colar** start commands com `Authorization: Bearer ${CRON_SECRET}` no Dashboard. Conferir 1 espaço.
10. **`STRIPE_WEBHOOK_SECRET` required no boot** mas Webhook só configurado na Fase 10. Placeholder `whsec_PENDING_PHASE_10` resolve.

---

## Referências cruzadas

- `packages/billing/PRODUCTION.md` — checklist Stripe-side detalhado
- `packages/auth/PRODUCTION.md` — auth + Redis + cron pattern genérico
- `packages/emails/PRODUCTION.md` — SendGrid + webhook setup
- `apps/<app>/CLAUDE.md` — config específica do app (env vars, rate limits, modelos AI)
- `CLAUDE.md` (root) — convenções monorepo + turbo.json env list
