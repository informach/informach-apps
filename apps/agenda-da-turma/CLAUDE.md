# `@informach/agenda-da-turma` — app guide

> Documentação primária do app para humanos e agentes. Para o root do monorepo ver [`/CLAUDE.md`](../../CLAUDE.md). Para os packages consumidos: [`@informach/auth/CLAUDE.md`](../../packages/auth/CLAUDE.md), [`@informach/billing/CLAUDE.md`](../../packages/billing/CLAUDE.md), [`@informach/emails/CLAUDE.md`](../../packages/emails/CLAUDE.md), [`@informach/ai-core/CLAUDE.md`](../../packages/ai-core/CLAUDE.md).

---

## 1. Propósito

Agenda da Turma é um app **single-user** para o responsável (pai/mãe) organizar a rotina escolar dos filhos — tarefas, provas, recados, entregas. O subject de billing é sempre o usuário responsável; perfis de filhos são **concept futuro** (modelo Netflix-household), não existem hoje no schema nem na UI.

Estado atual (2026-05-09): app early-stage. **Auth, billing e emails 100% wired** (paridade com cozya — onboarding com escolha de plano, `/settings/billing`, `/upgrade`, widget no dashboard, packs de crédito). **Dashboard ainda é placeholder** — não há features de agenda implementadas. **Sem IA hoje** — pipeline de créditos preparado pra quando alguma feature de IA aparecer.

Diferença de porte vs cozya: público maior potencial (pais brasileiros com filhos em idade escolar), valor percebido médio. Pricing reflete: Pro R$ 19,90/mês (vs R$ 14,90 do cozya).

---

## 2. Modelo econômico (alinhado com `@informach/billing`)

| Item | Valor |
|---|---|
| Pro mensal | **R$ 19,90/mês** (`agenda_da_turma_pro_monthly`) |
| Pro anual | **R$ 199,00/ano** (`agenda_da_turma_pro_annual`) — ~17% desc, 2 meses grátis |
| Créditos Pro | **50/mês**, drip mensal no anual, expiram no fim do ciclo |
| Free | acesso completo às features básicas, sem créditos de IA |
| Gateway de IA | (ainda não wired) |

### Pacotes extras (Pro-only)

Mesma régua do cozya — pack custa mais per-credit que o plano (premium 20-40%) pra incentivar assinatura:

| Pack | Créditos | Preço | R$/crédito |
|---|---|---|---|
| `agenda_da_turma_credits_10` | 10 | R$ 6,90 | R$ 0,69 |
| `agenda_da_turma_credits_20` | 20 | R$ 12,90 | R$ 0,645 |
| `agenda_da_turma_credits_30` | 30 | R$ 17,90 | R$ 0,597 |

### ⚠ Créditos sem consumo hoje

A Agenda da Turma **não tem nenhuma feature de IA implementada**. Plano Pro concede 50 créditos/mês via webhook + sweeper, mas nenhum código consome via `withCredits`. Quando feature de IA aparecer, será necessário:

1. Adicionar rows em `creditPricing` (criar `seedAgendaCreditPricing` em `packages/billing/src/seeds/credit-pricing.ts` análogo a `seedCozyaCreditPricing`).
2. Wire-up de `@informach/ai-core` no app (`createMastra`, `createSharedMemory`, `createOpenRouter`).
3. Criar agentes em `apps/agenda-da-turma/src/ai/`.
4. Envolver chamadas LLM em `withCredits` ou `runBillableAiCall`.
5. Adicionar rate-limit em `lib/rate-limit.ts` (defesa anti-script).
6. Adicionar `OPENROUTER_API_KEY` ao `lib/env.ts` e ao `turbo.json` `tasks.build.env`.

Definição econômica final (custo unitário, mix de modelos, margem) fica para quando o produto de IA estiver definido.

---

## 3. Estrutura

```
apps/agenda-da-turma/
├── src/
│   ├── app/                       # Next 16 app router
│   │   ├── (auth)/                # /login, /signup, /choose-plan (passo 3 onboarding)
│   │   ├── (app)/                 # autenticadas
│   │   │   ├── dashboard/         # placeholder + widget billing (Pro/Free)
│   │   │   ├── settings/billing/  # plano + saldo + packs (Pro) + history + portal
│   │   │   └── upgrade/           # PlanCards sem stepper, só Pro (Free → Pro)
│   │   ├── api/                   # webhooks/jobs (auth, billing, emails)
│   │   │   ├── auth/[...all]/     # Better Auth handler
│   │   │   ├── webhooks/{stripe,sendgrid}/
│   │   │   ├── jobs/              # 5 billing crons + 3 email crons
│   │   │   ├── email/unsubscribe/
│   │   │   └── health/
│   │   ├── playground/            # smoke test de tokens UI (mantido enquanto não há features reais)
│   │   ├── page.tsx               # placeholder de landing (texto simples, sem CTA)
│   │   └── layout.tsx             # Plus Jakarta Sans + ThemeProvider + Toaster
│   ├── features/
│   │   ├── billing/               # plan-cards, plan-card, credit-balance-card, credit-packs, history (paridade cozya)
│   │   └── onboarding/            # signup-form (3 passos), login-form, plan-cards usado em /choose-plan + /upgrade
│   ├── components/
│   │   ├── brand/agenda-logo.tsx  # logotipo SVG inline (theme-aware)
│   │   └── site-header.tsx        # header /login + /signup (logo + ModeToggle); evolui pra dashboard depois
│   ├── lib/
│   │   ├── env.ts                 # Zod-validated envs
│   │   ├── auth.ts                # createAuth({ email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" } })
│   │   ├── billing.ts             # createBillingService({ organizationsEnabled: false, app: APPS.agendaDaTurma.slug })
│   │   ├── emails.ts              # createEmailService(...)
│   │   ├── action.ts              # createActionFactory({ helpers: authResult })
│   │   ├── action-result.ts       # catchActionResult / isActionRejected (client helper)
│   │   ├── observability.ts       # packageLogger + Sentry
│   │   ├── redis.ts               # ioredis com ?family=0 implicit (Railway IPv6)
│   │   ├── sendgrid-webhook.ts    # signature verify helper
│   │   └── logger.ts              # pino app-level
│   ├── proxy.ts                   # auth proxy; requireAuth: ["/dashboard","/choose-plan","/upgrade","/settings"]
│   ├── instrumentation.ts         # Sentry init (server)
│   └── instrumentation-client.ts  # Sentry init (client)
├── e2e/                           # Playwright (auth signup/signin por senha/OTP)
├── public/
│   └── logotipo.svg               # asset original (versão inline em components/brand/)
└── next.config.ts                 # Sentry + standalone output + security headers/CSP estática
```

### Auth (OTP-only)

- **Verificação de email**: OTP 6 dígitos (não link).
- **Sign-in**: email/senha (sem magic link).
- **Forget password**: OTP (não link).

Justificativa em `packages/auth/CLAUDE.md` §3.1: OTP mantém usuário na mesma página, ótimo para mobile-first. Mesma decisão do cozya.

Notificação `auth.signup-attempt-on-existing` está wired e gated em `billing.hasProSubscription` (só dispara se a conta-alvo é Pro).

### Billing

- `subject.type = "user"` sempre (`organizationsEnabled: false`).
- `app: APPS.agendaDaTurma.slug` ("agenda-da-turma") garante isolamento de customers/credits do cozya — UNIQUE `(provider, subject_type, subject_id, app)` em `billing.customers`.
- `hasProSubscription` é o gate único para liberar packs de crédito + (futuramente) features de IA.
- LGPD: `accountDeletion.onBeforeDelete` chama `billing.cancelBillingForSubject` (cancela assinaturas; saldos e linhas históricas ficam por retenção fiscal).
- Webhook handlers transacionais (`billing.payment-success` / `subscription-renewed` / `subscription-canceled` / `credits-purchased`) e dunning (`billing.payment-failed` via cron) usam `appName: APPS.agendaDaTurma.name` ("Agenda da Turma") nos templates.

### Onboarding em 3 passos

1. **Cadastro** — name + email + password → `/signup`.
2. **Verificação** — OTP 6 dígitos → reenviar com cooldown de 60s.
3. **Plano** — `/choose-plan`, free vs Pro mensal/anual; Free vai pra `/dashboard?welcome=...`, Pro abre Stripe Checkout.

Stepper (`features/onboarding/components/onboarding-stepper.tsx`) usa `currentStep: 1 | 2 | 3`. Após OTP verify, `signup-form.tsx` redireciona pra `/choose-plan` por default (override possível via prop `verifiedRedirectTo`).

---

## 4. Stripe Dashboard — checklist operacional

Antes de habilitar Pro/Pacotes em produção, criar estes 5 prices no Dashboard (test + live) e substituir os `price_TODO_*` em `packages/config/src/products.ts`:

| Product | Tipo | BRL | Stripe Price ID |
|---|---|---|---|
| Agenda da Turma Pro Monthly | Subscription/recurring | R$ 19,90 | `agenda_da_turma_pro_monthly.stripePriceId.{dev,prod}` |
| Agenda da Turma Pro Annual | Subscription/recurring | R$ 199,00 | `agenda_da_turma_pro_annual.stripePriceId.{dev,prod}` |
| 10 créditos | One-time | R$ 6,90 | `agenda_da_turma_credits_10.stripePriceId.{dev,prod}` |
| 20 créditos | One-time | R$ 12,90 | `agenda_da_turma_credits_20.stripePriceId.{dev,prod}` |
| 30 créditos | One-time | R$ 17,90 | `agenda_da_turma_credits_30.stripePriceId.{dev,prod}` |

Com `NODE_ENV=production` e `STRIPE_MODE=prod`, `src/lib/billing.ts` falha no boot se qualquer produto da Agenda ainda tiver `price_TODO_*`. UI também esconde packs com placeholder via `isStripePriceIdConfigured` no slot do `/settings/billing`, e checkout do Pro retorna `PRO_NOT_CONFIGURED` no toast (`InvalidProductError` do package). Ainda assim, **não habilitar Pro em produção sem preencher os IDs reais**.

Webhook endpoint + eventos de billing: ver `packages/billing/PRODUCTION.md` e `docs/deploy-runbook.md` Fase 10.

### Crons no Railway (não recriar)

A estratégia é **híbrida** (ver `docs/deploy-runbook.md` Fase 11): existem 7 cron services per-app + 2 globais no Railway, **independentes do número de apps**. Pra ativar os crons da Agenda da Turma após deploy:

1. Editar a env var `APP_DOMAINS` em cada um dos 7 cron-perapp services.
2. Adicionar `agenda-da-turma.informach.com.br` (space-separated):
   ```
   APP_DOMAINS=cozya.informach.com.br agenda-da-turma.informach.com.br
   ```
3. Os 2 cron-global services (`auth-cleanup`, `email-suppression-sync`) operam em schemas compartilhados (`core.users`, `core.email_suppressions`) — **nada a fazer**.

**Não criar cron services novos.** As rotas `/api/jobs/billing-*` e `/api/jobs/email-*` já existem no app — recebem o curl do loop `for d in $APP_DOMAINS; do curl https://$d/api/jobs/<endpoint>; done`.

---

## 5. Env vars

Validadas em `src/lib/env.ts` via Zod (`@t3-oss/env-nextjs`):

| Var | Required | Notas |
|---|---|---|
| `DATABASE_URL` | sim | Postgres compartilhado com auth/emails/billing |
| `BETTER_AUTH_SECRET` | sim | ≥32 chars (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | sim | URL pública (HTTPS em prod) |
| `NEXT_PUBLIC_APP_URL` | sim | mesmo valor de `BETTER_AUTH_URL` |
| `SENDGRID_API_KEY` | sim | escopo Mail Send + Suppressions |
| `SENDGRID_FROM` | sim | email verificado no domínio autenticado |
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | opcional | só se webhook ativado |
| `EMAIL_SANDBOX_MODE` | default `live` | `live\|sandbox\|memory` |
| `EMAIL_SANDBOX_DIR` | default `./tmp/integration_emails` | só pra `mode=sandbox` |
| `CRON_SECRET` | sim | ≥32 chars; gate de `/api/jobs/*` |
| `STRIPE_SECRET_KEY` | sim | `sk_test_*\|sk_live_*\|rk_test_*\|rk_live_*` (restricted recomendado em prod) |
| `STRIPE_WEBHOOK_SECRET` | sim | `whsec_*`; placeholder na fase 5 do runbook |
| `STRIPE_PUBLISHABLE_KEY` | opcional | só se for usar Stripe Elements client-side |
| `STRIPE_MODE` | opcional | override; default infere de `NODE_ENV` |
| `REDIS_URL` | opcional dev / **obrigatório prod** | secondary storage do Better Auth + futuro rate-limit. Use `?family=0` no Railway (IPv6-only) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | opcional | habilita social login Google |
| `E2E_RELAX_AUTH_RATE_LIMITS` | opcional | `"1"` em CI Playwright; **proibido em prod** (guard pós-parse) |
| `LOG_LEVEL` | opcional | `debug\|info\|warn\|error` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | opcional | wire-up Sentry |

**Build-time vars** (afetam output Next): toda var lida via `env.X` em código de boot/proxy precisa estar em `turbo.json` `tasks.build.env`. Ao adicionar nova var build-relevante, atualizar lá ou Turbo serve cache stale.

---

## 6. Pendências vs cozya (gaps conhecidos)

Ordem rough de prioridade quando produto evoluir:

1. **Dashboard real** — hoje só widget de billing + saudação. Adicionar features de agenda (tarefas/provas/lembretes) é o próximo grande bloco de produto.
2. **`apps/agenda-da-turma/railway.toml`** — não existe ainda. Quando deploy for plugado, copiar pattern do cozya (`pnpm install --frozen-lockfile --prod=false && pnpm build:agenda-da-turma`, healthcheck `/api/health`).
3. **Price IDs live** — substituir todos os `price_TODO_*` da Agenda em `packages/config/src/products.ts` antes de habilitar Pro/Pacotes em produção. O boot guard em `src/lib/billing.ts` trava se faltar algum.
4. **PWA** — sem manifest, sem icons (só `public/logotipo.svg`). Pattern em `apps/cozya/src/app/{manifest.ts,apple-icon.png,icon.png,icon.svg}` + `metadata.appleWebApp` em `layout.tsx`.
5. **CSP nonce per-request** — `next.config.ts` já aplica security headers e CSP estática. Se a Agenda passar a precisar de scripts inline próprios, evoluir para o pattern com nonce em `apps/cozya/src/lib/csp.ts` + `apps/cozya/next.config.ts:headers()`.
6. **Rate limit anti-script** — `lib/rate-limit.ts` com Postgres-via-Redis ainda não existe. Replicar pattern do cozya quando feature de IA chegar (defesa em camadas além do cap mensal de créditos).
7. **IA pipeline** — descrito em §2 acima. Bloco grande: agentes Mastra + seed `creditPricing` + integração `withCredits`/`runBillableAiCall`.
8. **Site header pra dashboard** — `site-header.tsx` hoje é minimalista (só auth pages). Quando dashboard tiver navegação real, evoluir pro pattern variant igual `apps/cozya/src/components/marketing/site-header.tsx`.
9. **Landing pública** — `app/page.tsx` é placeholder. Decisão de produto: ter landing própria em `agenda-da-turma.informach.com.br/` ou redirect pra `informach.com.br/agenda-da-turma`?

---

## 7. Comandos

```bash
# dev
pnpm dev:agenda-da-turma                                                # porta 3001

# verificação
pnpm --filter @informach/agenda-da-turma typecheck
pnpm --filter @informach/agenda-da-turma test                           # vitest
pnpm --filter @informach/agenda-da-turma exec biome check src

# build
pnpm build:agenda-da-turma                                              # produção (standalone output)
pnpm start:agenda-da-turma                                              # serve build local

# E2E
pnpm --filter @informach/agenda-da-turma e2e                            # Playwright (precisa do dev server up)
pnpm --filter @informach/agenda-da-turma e2e:install                    # baixa Chromium 1×
pnpm --filter @informach/agenda-da-turma e2e:ui                         # modo interativo

# teste isolado
pnpm --filter @informach/agenda-da-turma vitest run path/to/file.test.ts -t "test name"
pnpm --filter @informach/agenda-da-turma exec playwright test e2e/auth.signup-and-verify.spec.ts
```

---

## 8. Regras para agentes

1. **Mudar preço Pro**: editar `listPrice.amountCents` dos 2 produtos em `packages/config/src/products.ts` E atualizar Stripe Dashboard. Os dois lados precisam bater — divergência é bug.
2. **Adicionar nova feature de IA**: ver checklist em §2. Não pular `withCredits` — o gate de Pro+créditos é a única defesa contra Free consumindo IA.
3. **Ajustar cap de créditos**: editar `bonusCreditsPerMonth` nos 2 produtos Pro em `products.ts`. UI auto-reflete via `currentProduct.bonusCreditsPerMonth` no `CreditBalanceCard`.
4. **Stripe API version**: pinned em `2026-04-22.dahlia` no package `@informach/billing`. Bumpar requer validar payloads (ver `packages/billing/CLAUDE.md` §1).
5. **Free não chama IA** (quando IA existir): o gate é `billing.hasProSubscription`. Nunca contornar — Free com IA quebra economia.
6. **Single-user invariant**: `subject.type === "user"` em todo lugar. Não introduzir `organization` subject sem antes flipar `organizationsEnabled: true` no `createAuth` E `createBillingService` (decisão de produto, não code change isolado).
7. **`subject.id` é o `users.id` do `core` schema** (ver `lib/billing.ts:resolveSubjectEmail`). Não usar `users.email` como ID — o subject de billing é estável; email pode mudar.
8. **Webhook dunning** (`/api/jobs/billing-dunning/route.ts`) embute lógica de send inline (não usa wrapper `retryBillingDunningEmails` como cozya). Aceitável hoje; se a função crescer, extrair pra `features/billing/service.ts` igual cozya.
9. **`auth.signup-attempt-on-existing`** só dispara pra contas Pro (`billing.hasProSubscription` gate). Mantém esse gate — privilégio do Pro, evita spam.
10. **Cron services no Railway**: NUNCA criar services novos. Editar `APP_DOMAINS` nos 7 cron-perapp existentes (ver §4 + `docs/deploy-runbook.md` Fase 11).
11. **Adicionar nova rota authenticated**: incluir o prefixo em `requireAuth` no `src/proxy.ts`. Default deny não está ligado — só os prefixos listados são gated.
12. **Não importar `@ai-sdk/openai` ou `@ai-sdk/anthropic` direto** quando IA chegar. Usar `createOpenRouter` de `@informach/ai-core/providers` (mesma regra do cozya §10.10). Whisper transcription pode usar `createOpenAI` apontando pra `https://openrouter.ai/api/v1`.
13. **Adicionar nova categoria de email**: ver `packages/emails/CLAUDE.md` §7 regra 3. Hoje a Agenda usa as mesmas categorias que cozya (`auth.*`, `billing.*`).
14. **Account deletion (LGPD)**: NÃO remover o hook `accountDeletion.onBeforeDelete` em `lib/auth.ts`. Sem ele, deletar a conta deixa subscriptions Stripe ativas e a cobrança continua.

---

## 9. Histórico relevante

- Commit `cb219f3` (per-app billing isolation): adicionou coluna `app` em `billing.{customers,credit_ledger,credit_reservations}`, UNIQUE composto `(provider, subjectType, subjectId, app)`. Permite que o mesmo `user.id` tenha customers Stripe distintos no cozya e na agenda. Migration `0020_exotic_wither.sql`.
- Commit `381e053` (site header com logo + theme toggle): SiteHeader em `/login` e `/signup`, AgendaLogo SVG inline.
- Sessão atual (replicar billing do cozya): full UX de billing — onboarding step 3, `/settings/billing`, `/upgrade`, dashboard widget Pro/Free, packs Pro-only, server actions e cron routes. Bug fix em `billing-dunning/route.ts` (URL `/admin/billing` que não existia → `/settings/billing`).
