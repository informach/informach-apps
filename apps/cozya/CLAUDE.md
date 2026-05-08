# `@informach/cozya` — app guide

> Documentação primária do app para humanos e agentes. Para o root do monorepo ver [`/CLAUDE.md`](../../CLAUDE.md). Para os packages consumidos: [`@informach/auth/CLAUDE.md`](../../packages/auth/CLAUDE.md), [`@informach/billing/CLAUDE.md`](../../packages/billing/CLAUDE.md), [`@informach/emails/CLAUDE.md`](../../packages/emails/CLAUDE.md), [`@informach/ai-core/CLAUDE.md`](../../packages/ai-core/CLAUDE.md).

---

## 1. Propósito

Cozya é um app **single-user** (sem organizations) para cadastrar, organizar e gerar receitas de culinária. A IA é o diferencial: extrai receitas de **foto**, **URL** ou **texto colado**, gera receitas a partir de **prompt** e refina conversacionalmente. Sem IA é um catálogo manual com limite de receitas — com Pro, IA ilimitada (até o cap mensal de créditos).

Porte: nicho pequeno (food enthusiasts em PT-BR), valor percebido baixo. Estratégia de pricing reflete isso — preço barato + margem alta sobre custo unitário muito baixo de IA.

---

## 2. Modelo econômico (alinhado com `@informach/billing`)

| Item | Valor |
|---|---|
| Pro mensal | **R$ 14,90/mês** (`cozya_pro_monthly`) |
| Pro anual | **R$ 149/ano** (`cozya_pro_annual`) — ~17% desc, 2 meses grátis |
| Créditos Pro | **30/mês**, drip mensal no anual, expiram no fim do ciclo |
| Regra de débito | **1 chamada à API de IA = 1 crédito** (independente de salvar resultado) |
| Free | **sem IA** — cadastro 100% manual, com limite de receitas |
| Modelo default texto/URL/geração | **`openai/gpt-4o-mini`** via OpenRouter |
| Modelo default vision (foto) | **`openai/gpt-4o`** via OpenRouter, com `imageDetail: 'low'` |
| Modelo de transcrição (voz) | **`openai/whisper-1`** via OpenRouter (`/audio/transcriptions` OpenAI-compatible) |
| Gateway de IA | **OpenRouter único** — `OPENROUTER_API_KEY` na env, sem `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` |
| Rate limit (Pro) | **10 chamadas/hora** por usuário (defesa anti-script, além do cap mensal) |

### Pacotes extras (Pro-only)

Padrão Anthropic/OpenAI/Cursor: **todo pack custa mais per-credit que o plano** (Pro = R$ 0,497/crédito). Packs com premium de 20-40% sinalizam "assinatura é o melhor valor; pacote é para emergência". Volume dá desconto progressivo dentro do range premium.

| Pack | Créditos | Preço | R$/crédito | Premium vs plano |
|---|---|---|---|---|
| `cozya_credits_10` | 10 | R$ 6,90 | R$ 0,69 | +39% |
| `cozya_credits_20` | 20 | R$ 12,90 | R$ 0,645 | +30% |
| `cozya_credits_30` | 30 | R$ 17,90 | R$ 0,597 | +20% |

Cap volume em 30 (= 1 mês completo) — não vendemos volumes maiores que o cap mensal.

### Por que cobrar por chamada e não por cadastro salvo

A regra inicial "1 cadastro = 1 crédito" tem furo: o usuário pode invocar IA várias vezes (gerar do zero, refinar prompt, conversar) sem salvar — gastando OpenRouter sem debitar. Com "1 chamada = 1 crédito" + reserve→commit/release de `@informach/billing/credits`, cada invocação é debitada antes da chamada e estornada se a API falhar. Custo do upstream sempre coberto.

### Economia unitária esperada

| Tipo de chamada | Custo USD (~OpenRouter, ~5% markup sobre OpenAI) | Custo BRL (USD R$ 5,20) |
|---|---|---|
| Foto (`openai/gpt-4o` vision, imageDetail=low) | $0,005-0,016 | R$ 0,03-0,08 |
| Texto/URL/geração (`openai/gpt-4o-mini`) | $0,001-0,003 | R$ 0,005-0,017 |
| Transcrição (`openai/whisper-1`) | ~$0,006/min | ~R$ 0,03/min |

Mix esperado (50% texto/URL, 30% geração/refino, 20% foto): **~R$ 0,02 por chamada**. 30 créditos no mês = **~R$ 0,60 custo de IA**. Receita Pro R$ 14,90 → **margem bruta ~96%** (markup do OpenRouter já incluído).

---

## 3. Estrutura

```
apps/cozya/
├── src/
│   ├── app/                       # Next 16 app router
│   │   ├── (app)/settings/billing # plan + balance + packs + history
│   │   ├── api/                   # webhooks/jobs (auth, billing, emails)
│   │   ├── manifest.ts            # PWA manifest (Next metadata route)
│   │   ├── apple-icon.png         # 180x180 — iOS home-screen
│   │   ├── icon.png|.svg          # generic favicons
│   │   └── ...
│   ├── features/
│   │   ├── ai/                    # parse/transcribe/research services (OpenRouter)
│   │   ├── billing/               # plan-card, credit-balance-card, credit-packs-section
│   │   ├── onboarding/            # signup + escolha de plano
│   │   └── ...
│   ├── lib/
│   │   ├── env.ts                 # Zod-validated envs (OPENROUTER_API_KEY, CSP_ENFORCE)
│   │   ├── auth.ts                # createAuth({ email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" } })
│   │   ├── billing.ts             # createBillingService({ organizationsEnabled: false })
│   │   ├── emails.ts              # createEmailService(...)
│   │   ├── rate-limit.ts          # ⚠ defesa anti-script (Redis-based)
│   │   ├── csp.ts                 # buildCspHeader (nonce + strict-dynamic)
│   │   ├── observability.ts       # packageLogger + Sentry
│   │   ├── action.ts              # createActionFactory({ helpers: authResult })
│   │   └── ...
│   ├── ai/                        # Mastra agents (recipeParser, recipeParserVision)
│   ├── proxy.ts                   # auth proxy + CSP nonce per-request
│   └── ...
├── public/
│   ├── web-app-manifest-192x192.png  # PWA icons (any+maskable purposes)
│   ├── web-app-manifest-512x512.png
│   └── logotipo.svg
├── next.config.ts                 # Sentry + headers() de segurança (HSTS, COOP, etc)
└── e2e/                           # Playwright (mode: EMAIL_SANDBOX_MODE=memory)
```

### Auth (OTP-only)

- **Verificação de email**: OTP 6 dígitos (não link).
- **Sign-in**: email/senha (sem magic link).
- **Forget password**: OTP (não link).

Justificativa em `packages/auth/CLAUDE.md` §3.1: OTP mantém usuário na mesma página do app, ótimo para mobile-first.

### Billing

- `subject.type = "user"` sempre (sem organizations).
- `hasProSubscription` é o gate único para liberar IA + comprar credit packs (single source).
- LGPD: `accountDeletion.onBeforeDelete` chama `billing.cancelBillingForSubject`.

---

## 4. Rate limit de IA — `lib/rate-limit.ts`

Helper Postgres-via-Redis para defesa anti-script. Independente do cap mensal de créditos.

```ts
import { aiInvokeKey, COZYA_RATE_LIMITS, enforceRateLimit, RateLimitedError } from "@/lib/rate-limit";

// Em uma server action de IA (antes de reserveCredits):
try {
  await enforceRateLimit({
    key: aiInvokeKey(user.id),
    ...COZYA_RATE_LIMITS.AI_INVOKE_PER_HOUR, // { limit: 10, windowSeconds: 3600 }
  });
} catch (err) {
  if (err instanceof RateLimitedError) {
    return err({ code: "RATE_LIMITED", retryAfter: err.retryAfterSeconds });
  }
  throw err;
}
const reservation = await billing.reserveCredits({ ... });
// ...
```

Quando `REDIS_URL` não está configurado (dev local), o helper loga warn e libera (passthrough). Produção sempre exige Redis.

---

## 5. Stripe Dashboard — checklist operacional

Antes de habilitar Pro/Pacotes em produção, criar estes 5 prices no Dashboard (test + live) e substituir os `price_TODO_*` em `packages/config/src/products.ts`:

| Product | Tipo | BRL | Stripe Price ID |
|---|---|---|---|
| Cozya Pro Monthly | Subscription/recurring | R$ 14,90 | substitui `cozya_pro_monthly_prod` |
| Cozya Pro Annual | Subscription/recurring | R$ 149,00 | substitui `cozya_pro_annual_prod` |
| 10 créditos | One-time | R$ 6,90 | substitui `cozya_credits_10_dev/prod` |
| 20 créditos | One-time | R$ 12,90 | substitui `cozya_credits_20_dev/prod` |
| 30 créditos | One-time | R$ 17,90 | substitui `cozya_credits_30_dev/prod` |

Com `NODE_ENV=production` e `STRIPE_MODE=prod`, o app falha no boot se qualquer produto Cozya ainda tiver `price_TODO_*`.

Webhook endpoint + eventos de billing: ver `packages/billing/PRODUCTION.md`.

---

## 6. Seed de pricing (`creditPricing` table)

`billing.credit_pricing` precisa de rows ativas para que `withCredits` consiga resolver `pricingId` e `flatCost` por feature. Rodar 1× por ambiente (idempotente):

```bash
pnpm db:seed
# delega para pnpm --filter @informach/billing seed
# que invoca seedCozyaCreditPricing(db) com COZYA_PRICING_SEED
```

Features registradas (todas com `flatCost: 1`, `defaultEstimateCredits: 1`). IDs de modelo são prefixados pelo provider de origem (convenção do OpenRouter):

| Feature | Modelo |
|---|---|
| `cozya.recipe.extract_from_photo` | `openai/gpt-4o` (vision, imageDetail=low) |
| `cozya.recipe.extract_from_url` | `openai/gpt-4o-mini` |
| `cozya.recipe.extract_from_text` | `openai/gpt-4o-mini` |
| `cozya.recipe.generate_from_prompt` | `openai/gpt-4o-mini` (com `openrouter.tools.webSearch`) |
| `cozya.recipe.refine_conversational` | `openai/gpt-4o-mini` |
| `cozya.recipe.transcribe_audio` | `openai/whisper-1` (voz → texto na busca, Pro-only) |
| `cozya.recipe.parse_voice` | `openai/gpt-4o-mini` (transcrição → receita estruturada) |

Para trocar de modelo no futuro: NÃO mutar a row — `creditPricing` é versionado por `(feature, model)` com `effective_to UNIQUE WHERE NULL`. Inserir nova row com novo modelo + atualizar a antiga com `effective_to = now()`. O helper `expireLegacyCozyaPricing(db)` (`packages/billing/src/seeds/credit-pricing.ts`) faz exatamente isso para os IDs antigos não-prefixados (`gpt-4o`, `gpt-4o-mini`, `whisper-1`) e roda automaticamente em `pnpm db:seed` antes do `seedCozyaCreditPricing`.

Fluxo de cadastro por voz consome duas chamadas de IA quando executado completo: `transcribe_audio` para áudio → texto e `parse_voice` para texto → receita estruturada. Chamadas pagas simples passam por `runBillableAiCall`; fluxos multiestágio, como geração por prompt com pesquisa + parse estruturado, usam uma reserva de billing e gravam cada etapa com `runRecordedAiCall` para manter auditoria separada sem cobrar crédito extra.

---

## 7. UX dos créditos

Decidido com a usuária:

- Card de saldo (`credit-balance-card.tsx`): "X de 30 créditos restantes este mês" + barra de progresso + tooltip explicando "cada uso da IA consome 1 crédito".
- Cards de pacotes: **preço total em destaque** (R$ 4,90 etc) + créditos como métrica secundária.
- Notificações 50%/80%/100% via email `billing.credits-warning` (idempotente por `(userId, threshold, periodStart)`).
- Empty state Free: "Funcionalidade Pro — assine para liberar IA" via `SubscriptionRequiredError`.

---

## 8. PWA + Segurança

### PWA (escopo mínimo, sem service worker)

Cozya é instalável como PWA em iOS e Android sem rodar service worker. Todo o setup é declarativo via Next 16 metadata routes:

- `src/app/manifest.ts` — `display: standalone`, ícones com `purpose: "any"` E `"maskable"` para os mesmos PNGs (Chrome aceita; Lighthouse PWA passa).
- `src/app/layout.tsx` — `viewport` (`themeColor`, `viewportFit: "cover"`) e `metadata.appleWebApp` (`capable: true`, `statusBarStyle: "black-translucent"`).
- `src/app/{favicon.ico,icon.png,icon.svg,apple-icon.png}` — Next auto-linka.

Sem cache de assets, sem offline, sem push notifications. A decisão é deliberada — adicionar SW exige cuidados extras (invalidação após mutate, CSP `worker-src`, conflito com cookies do Better Auth). O CSP já permite `worker-src 'self' blob:` para futuro.

### Segurança — headers + CSP

Headers estáticos em `next.config.ts:headers()`:

| Header | Valor | Onde |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Só prod |
| `X-Content-Type-Options` | `nosniff` | Sempre |
| `X-Frame-Options` | `DENY` | Sempre |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sempre |
| `Cross-Origin-Opener-Policy` | `same-origin` | Sempre (override `unsafe-none` em `/api/webhooks/*`) |
| `Cross-Origin-Resource-Policy` | `same-origin` | Sempre (override `cross-origin` em webhooks) |
| `Permissions-Policy` | `camera=(), geolocation=(), microphone=(self), payment=(), …` | `microphone=(self)` é necessário para receita por voz |

CSP é per-request (no `proxy.ts`), com **nonce + `'strict-dynamic'`** para scripts:

```
default-src 'self';
script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
style-src 'self' 'unsafe-inline' fonts.googleapis.com;
font-src 'self' fonts.gstatic.com data:;
img-src 'self' data: blob: *.stripe.com;
connect-src 'self' *.ingest.sentry.io api.stripe.com;
frame-src js.stripe.com hooks.stripe.com checkout.stripe.com accounts.google.com;
worker-src 'self' blob:; manifest-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self' checkout.stripe.com;
frame-ancestors 'none'; upgrade-insecure-requests;
report-uri <derivado de NEXT_PUBLIC_SENTRY_DSN>;
```

`style-src 'unsafe-inline'` é aceito (Tailwind 4 + shadcn injetam inline). Scripts são nonce-only — Next 16 + Sentry funcionam com `'strict-dynamic'`.

**Toggle Report-Only ↔ enforce via `env.CSP_ENFORCE`**: default `"0"` (Report-Only). Flow recomendado: deploy com `"0"` por 1 semana, monitorar violações no Sentry, depois flipar para `"1"`. Skipa para `/api/webhooks/*`, `/api/jobs/*`, `/api/health` (servem JSON para servers externos, não browser). `/api/email/unsubscribe` renderiza HTML no GET e deve receber CSP.

### Rate-limits explícitos do Better Auth (`auth.ts`)

`productionRateLimitRules` define limites apertados para 11 endpoints sensíveis (sign-in/sign-up/email-otp/forget-password). Defesa em camadas — quando `E2E_RELAX_AUTH_RATE_LIMITS=1`, o branch e2e relaxa só os endpoints de OTP/signup; em produção, `env.ts` rejeita `E2E_RELAX_AUTH_RATE_LIMITS=1` no boot (pós-parse guard).

---

## 9. Eval framework do `recipeParser`

Detecta regressão de qualidade do parser quando se troca prompt, modelo ou versão do AI SDK. Inspirado nos `scorers/` do repo `rodrigobranas/formacao_ia_arq_t1_4`. Saídas estruturadas no AI SDK usam `generateText({ output: Output.object({ schema }) })`; não adicionar usos novos de `generateObject`.

**Arquivos:**
- `src/ai/recipe-parser/instructions.ts` — `RECIPE_PARSER_INSTRUCTIONS` (puro; consumido por `agent.ts` em produção e por `scripts/run-evals.ts` no eval).
- `src/ai/recipe-parser/scorers/` — 3 scorers standalone:
  - `schema-validity-scorer` (não-LLM; binário; valida `recipeParserSchema`).
  - `scope-adherence-scorer` (LLM-as-judge; binário; classifica receita vs não-receita).
  - `ingredient-completeness-scorer` (LLM-as-judge; 0–1; verifica falta/halucinação de ingredientes).
- `src/ai/recipe-parser/evals/dataset.ts` — golden dataset (14 entradas: 5 text, 3 voice, 4 image, 2 prompt; o text-004 é negativo).
- `src/ai/recipe-parser/evals/fixtures/` — imagens (popular manualmente; `.gitkeep` documenta).
- `src/ai/recipe-parser/evals/__baseline__.json` — gerado por `EVAL_SNAPSHOT=1`. Não comitar antes de aceitar a qualidade atual como referência.
- `scripts/run-evals.ts` — runner via `tsx`.

**Custo:** ~R$ 1,00 por run completo (15 entradas × 3 scorers, 2 LLM-as-judge). **Não rodar em CI por default** — só on-demand pré-PR-de-prompt/modelo.

**Uso:**
```bash
pnpm --filter @informach/cozya eval                       # diff vs baseline
EVAL_SNAPSHOT=1 pnpm --filter @informach/cozya eval       # grava baseline
EVAL_FILTER=text- pnpm --filter @informach/cozya eval     # subset
EVAL_NO_LLM=1 pnpm --filter @informach/cozya eval         # só schema-validity (barato)
```

Regressão > 10pp em qualquer scorer faz exit non-zero. Baseline atualiza só com `EVAL_SNAPSHOT=1` num momento que se confie na qualidade.

---

## 10. Regras para agentes

1. **Mudar preço Pro**: editar `listPrice.amountCents` em `packages/config/src/products.ts` E atualizar Stripe Dashboard. Os dois lados precisam bater — divergência é bug.
2. **Adicionar nova feature de IA**: criar row em `COZYA_PRICING_SEED` (`packages/billing/src/seeds/credit-pricing.ts`) com **ID de modelo prefixado** (`openai/gpt-4o-mini` por default; `openai/gpt-4o` apenas para vision real; `openai/whisper-1` para transcrição), adicionar em `setSeed()`, atualizar tabela §6 deste doc.
3. **Ajustar cap de créditos**: editar `bonusCreditsPerMonth` nos 2 produtos Pro em `products.ts`. UI auto-reflete via `currentProduct.bonusCreditsPerMonth`.
4. **Mudar rate limit de IA**: editar `COZYA_RATE_LIMITS` em `apps/cozya/src/lib/rate-limit.ts`. Tests cobrem o catálogo.
5. **Mudar rate limits de auth**: editar `productionRateLimitRules` em `apps/cozya/src/lib/auth.ts` (o branch e2e fica intacto).
6. **Stripe API version**: pinned em `2026-04-22.dahlia`. Bumpar requer validar payload (ver §1 de `packages/billing/CLAUDE.md`).
7. **Free não chama IA**: o gate é `billing.hasProSubscription`. Nunca contornar — Free com IA quebra economia (custo absorvido sem receita).
8. **Antes de chamar `runBillableAiCall`/`withCredits` em uma action de IA**, sempre passar pelo `enforceRateLimit` (defesa em camadas).
9. **Chamada de IA paga simples** usa `runBillableAiCall`; fluxo multiestágio usa uma única reserva (`withCredits`) e `runRecordedAiCall` para cada etapa auditável.
10. **NUNCA** importar `@ai-sdk/openai` ou `@ai-sdk/anthropic` direto em features do cozya. Usar **sempre** `createOpenRouter` de `@informach/ai-core/providers`. A única exceção é `transcribeAudio` (que reusa `createOpenAI` internamente apontando para `https://openrouter.ai/api/v1`).
11. **Adicionar CDN/origin ao CSP**: editar `apps/cozya/src/lib/csp.ts` (constantes agrupadas por categoria). Rodar com `CSP_ENFORCE=0` em produção primeiro para confirmar que não quebra nada.
12. **Adicionar nova rota de API que renderiza HTML/RSC**: garantir que NÃO está em `CSP_SKIP_PREFIXES` (`csp.ts`). Skip é só para webhooks/jobs/health.
13. **Mudar `RECIPE_PARSER_INSTRUCTIONS`**: editar `src/ai/recipe-parser/instructions.ts` E rodar o eval (§9) antes do PR. Se algum scorer cair > 10pp vs baseline, ou ajuste o prompt, ou aceite explicitamente atualizando o baseline.
14. **Adicionar nova entrada ao golden dataset**: editar `src/ai/recipe-parser/evals/dataset.ts`. Não remover entradas antigas — elas guardam regressão acumulada.
