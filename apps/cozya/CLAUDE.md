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
| Modelo default texto/URL/geração | **OpenAI GPT-4o-mini** |
| Modelo default vision (foto) | **OpenAI GPT-4o** com `imageDetail: 'low'` |
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

A regra inicial "1 cadastro = 1 crédito" tem furo: o usuário pode invocar IA várias vezes (gerar do zero, refinar prompt, conversar) sem salvar — gastando OpenAI sem debitar. Com "1 chamada = 1 crédito" + reserve→commit/release de `@informach/billing/credits`, cada invocação é debitada antes da chamada e estornada se a API falhar. Custo da OpenAI sempre coberto.

### Economia unitária esperada

| Tipo de chamada | Custo USD | Custo BRL (USD R$ 5,20) |
|---|---|---|
| Foto (GPT-4o vision, imageDetail=low) | $0,005-0,015 | R$ 0,03-0,08 |
| Texto/URL/geração (GPT-4o-mini) | $0,001-0,003 | R$ 0,005-0,016 |

Mix esperado (50% texto/URL, 30% geração/refino, 20% foto): **~R$ 0,02 por chamada**. 30 créditos no mês = **~R$ 0,60 custo de IA**. Receita Pro R$ 14,90 → **margem bruta ~96%**.

---

## 3. Estrutura

```
apps/cozya/
├── src/
│   ├── app/                       # Next 16 app router
│   │   ├── (app)/settings/billing # plan + balance + packs + history
│   │   ├── api/                   # webhooks/jobs (auth, billing, emails)
│   │   └── ...
│   ├── features/
│   │   ├── billing/               # plan-card, credit-balance-card, credit-packs-section
│   │   ├── onboarding/            # signup + escolha de plano
│   │   └── ...
│   ├── lib/
│   │   ├── env.ts                 # Zod-validated envs
│   │   ├── auth.ts                # createAuth({ email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" } })
│   │   ├── billing.ts             # createBillingService({ organizationsEnabled: false })
│   │   ├── emails.ts              # createEmailService(...)
│   │   ├── rate-limit.ts          # ⚠ defesa anti-script (Redis-based)
│   │   ├── observability.ts       # packageLogger + Sentry
│   │   ├── action.ts              # createActionFactory({ helpers: authResult })
│   │   └── ...
│   └── proxy.ts                   # createAuthProxy (Next 16, não middleware.ts)
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

Webhook endpoint + eventos de billing: ver `packages/billing/PRODUCTION.md`.

---

## 6. Seed de pricing (`creditPricing` table)

`billing.credit_pricing` precisa de rows ativas para que `withCredits` consiga resolver `pricingId` e `flatCost` por feature. Rodar 1× por ambiente (idempotente):

```bash
pnpm db:seed
# delega para pnpm --filter @informach/billing seed
# que invoca seedCozyaCreditPricing(db) com COZYA_PRICING_SEED
```

Features registradas (todas com `flatCost: 1`, `defaultEstimateCredits: 1`):

| Feature | Modelo |
|---|---|
| `cozya.recipe.extract_from_photo` | `gpt-4o` (vision, imageDetail=low) |
| `cozya.recipe.extract_from_url` | `gpt-4o-mini` |
| `cozya.recipe.extract_from_text` | `gpt-4o-mini` |
| `cozya.recipe.generate_from_prompt` | `gpt-4o-mini` |
| `cozya.recipe.refine_conversational` | `gpt-4o-mini` |
| `cozya.recipe.transcribe_audio` | `whisper-1` (voz → texto na busca, Pro-only) |

Para trocar de modelo no futuro: NÃO mutar a row — `creditPricing` é versionado por `(feature, model)` com `effective_to UNIQUE WHERE NULL`. Inserir nova row com novo modelo + atualizar a antiga com `effective_to = now()`.

---

## 7. UX dos créditos

Decidido com a usuária:

- Card de saldo (`credit-balance-card.tsx`): "X de 30 créditos restantes este mês" + barra de progresso + tooltip explicando "cada uso da IA consome 1 crédito".
- Cards de pacotes: **preço total em destaque** (R$ 4,90 etc) + créditos como métrica secundária.
- Notificações 50%/80%/100% via email `billing.credits-warning` (idempotente por `(userId, threshold, periodStart)`).
- Empty state Free: "Funcionalidade Pro — assine para liberar IA" via `SubscriptionRequiredError`.

---

## 8. Regras para agentes

1. **Mudar preço Pro**: editar `listPrice.amountCents` em `packages/config/src/products.ts` E atualizar Stripe Dashboard. Os dois lados precisam bater — divergência é bug.
2. **Adicionar nova feature de IA**: criar row em `COZYA_PRICING_SEED` (`packages/billing/src/seeds/credit-pricing.ts`), adicionar em `setSeed()`, atualizar tabela §6 deste doc. Modelo = `gpt-4o-mini` por default; `gpt-4o` apenas para vision real; `whisper-1` para transcrição de áudio.
3. **Ajustar cap de créditos**: editar `bonusCreditsPerMonth` nos 2 produtos Pro em `products.ts`. UI auto-reflete via `currentProduct.bonusCreditsPerMonth`.
4. **Mudar rate limit**: editar `COZYA_RATE_LIMITS` em `apps/cozya/src/lib/rate-limit.ts`. Tests cobrem o catálogo.
5. **Stripe API version**: pinned em `2026-04-22.dahlia`. Bumpar requer validar payload (ver §1 de `packages/billing/CLAUDE.md`).
6. **Free não chama IA**: o gate é `billing.hasProSubscription`. Nunca contornar — Free com IA quebra economia (custo absorvido sem receita).
7. **Antes de chamar `reserveCredits` em uma action de IA**, sempre passar pelo `enforceRateLimit` (defesa em camadas).
