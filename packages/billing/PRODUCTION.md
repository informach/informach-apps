# `@informach/billing` — checklist de produção

Tudo o que o operador precisa fazer para subir o billing com Stripe em produção (Railway). Auth-related production (CSP, Redis, services Railway base) está em `@informach/auth/PRODUCTION.md`. Email production em `@informach/emails/PRODUCTION.md`. Esta lista é específica do billing.

---

## 1. Stripe account — live mode

### 1.1 Ativação da conta live

1. Stripe Dashboard → toggle no canto superior esquerdo: **Test mode → Live mode**.
2. Activate Account: razão social, CNPJ, dados bancários BR, etc. Pode levar 1–3 dias úteis para aprovação.
3. Após aprovado, **Settings → Business settings → Public details:** logotipo, suporte email/phone (aparecem no Checkout e nos receipts).
4. **Settings → Account details → Statement descriptor:** texto curto que aparece na fatura do cartão do cliente (ex: `INFORMACH PLT`). Máximo 22 chars.

### 1.2 Domínio custom para Checkout

Em prod, Checkout abre em `https://checkout.stripe.com/...` por padrão. Para evitar que o cliente saia do domínio (e melhorar trust):

1. **Settings → Payments → Stripe-hosted pages → Custom domains** → Add domain.
2. Configurar 4 CNAMEs no DNS apontando para `*.stripe.com` (Stripe gera os exatos).
3. Após validação, Checkout passa a abrir em `https://checkout.informach.com.br/...`.

> Não é obrigatório, mas reduz fricção. Sem isso, ainda funciona perfeitamente.

### 1.3 Métodos de pagamento

**Settings → Payments → Payment methods.** Para BR:
- **Cartão de crédito/débito:** sempre ON (padrão).
- **Pix (futuro):** disponível via Stripe; precisa ativar manualmente. Considerar quando relevante.
- **Boleto:** Stripe NÃO oferece direto no Brasil (usar `@informach/billing` provider Asaas no futuro).

---

## 2. Produtos + Prices no Stripe Dashboard

Cada produto declarado em `packages/config/src/products.ts` precisa de um `Price` correspondente no Stripe (test E live). Esses Price IDs vivem em `Product.stripePriceId.{dev, prod}`.

### 2.1 Para subscriptions

1. **Products → Add product**.
2. Name: bater com `Product.name` no config (ex: `Agenda Pro Mensal`).
3. Description: opcional (aparece no Checkout).
4. **Pricing → Standard pricing**:
   - Type: **Recurring**.
   - Currency: **BRL**.
   - Price: ex `R$ 49,90`.
   - Billing period: **Monthly** (ou Annual).
5. Save → copiar o `price_xxx` gerado.
6. Adicionar em `packages/config/src/products.ts`:
   ```ts
   {
     id: "agenda_pro_monthly",
     app: "agenda-da-turma",
     kind: "subscription",
     tier: "pro",
     interval: "month",
     name: "Agenda Pro Mensal",
     bonusCreditsPerMonth: 1000,
     stripePriceId: { dev: "price_test_xxx", prod: "price_live_xxx" },
   }
   ```
7. **Repetir em test mode** (toggle Test no Dashboard → criar product igual → copiar `price_test_*`).

### 2.2 Para credit packs (one-time)

Mesmo flow, mas:
- Type: **One-time** (não Recurring).
- Não tem billing period.
- No config: `kind: "credit_pack"`, `creditAmount: 5000` (quantos créditos esse pacote dá).

### 2.3 Versionar produtos

**Nunca delete um Price em uso.** Subscriptions ativas continuam referenciando o Price antigo — apagar quebra renovações. Para mudar preço:
1. Crie um novo Price no mesmo Product (Stripe permite múltiplos Prices/Product).
2. Atualize `stripePriceId.prod` no config para o novo.
3. Subs existentes continuam no preço antigo (grandfathered) ou migre via `billing.updateSubscription({ subscriptionId, newPriceId, prorationBehavior: "create_prorations" })`.

---

## 3. Webhook endpoint

Crítico — sem isso, pagamentos confirmam mas nada chega ao DB. **Obrigatório** antes do primeiro pagamento real.

### 3.1 Configurar no Stripe Dashboard

1. **Developers → Webhooks → Add endpoint** (em **live mode**, repetir em test mode).
2. **Endpoint URL:** `https://<dominio-custom-do-app>/api/webhooks/stripe` — UM endpoint por app. Em PR/staging do Railway, usar o `*.up.railway.app` se não houver custom domain ainda.
3. **Description:** `agenda-da-turma — billing` (ou cozya).
4. **Events to send:** **Select events** → habilitar exatamente estes (no menos, evita ruído):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `payment_intent.succeeded`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `charge.refunded` (se Phase 4 de refunds estiver wirada — opcional)
5. **API version:** `2026-04-22.dahlia` (matches `stripe-node@22.1` instalado). Não usar "Account default" — isso fica drift entre apps se a conta default Stripe for atualizada.
6. Save → copiar o **Signing secret** (`whsec_...`) que aparece.

### 3.2 Configurar no app (Railway)

Em `Service → Variables`, setar:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Ambos devem ser **per-service** (NÃO shared) — cada app tem sua webhook secret distinta porque é um endpoint diferente no Stripe Dashboard.

### 3.3 Smart retry policy do Stripe

Stripe retransmite webhooks em backoff exponencial até **3 dias** (default) se o endpoint não responder 2xx. Isso é importante porque:
- Nossos handlers são **idempotentes em 3 camadas** (`webhook_events` UNIQUE + `oneTimePayments/subscriptions.providerId` UNIQUE + `creditLedger.stripeEventId` UNIQUE) — replays são seguros.
- Em outage temporário (DB/Redis down), retornamos `500` e Stripe re-entrega quando voltarmos. Não há perda de evento até 3 dias.
- **Após 3 dias**, Stripe desiste e marca o webhook como "Failed". Para recuperar: Dashboard → Developers → Webhooks → endpoint → **Resend events** (manual).

### 3.4 Validação

1. Stripe Dashboard → Webhooks → endpoint → **Send test webhook** → escolher `payment_intent.succeeded`. Resposta deve ser `200 OK` no log do Railway.
2. SQL no DB:
   ```sql
   SELECT id, event_type, processed_at, processing_started_at, attempts, error
   FROM billing.webhook_events
   WHERE provider = 'stripe'
   ORDER BY created_at DESC LIMIT 10;
   ```
   Esperado: `processed_at` populado, `processing_started_at` null, `error` null, `attempts` = 1 (eventos novos).

---

## 4. Customer Portal

Permite ao cliente gerenciar pagamento, cancelar, ver invoices — tudo no UI hospedado pelo Stripe. **Configuração obrigatória** antes do primeiro acesso (botão "Gerenciar plano" na UI do app).

### 4.1 Configurar no Dashboard

1. **Settings → Billing → Customer portal → Configure** (em live, repetir em test).
2. **Functionality:**
   - **Customer information:** Update email + Update billing address: ON.
   - **Invoice history:** ON (cliente vê histórico).
   - **Payment methods:** Allow customers to update: ON.
   - **Subscriptions → Cancel:** ON. Cancellation behavior: **Cancel at end of billing period** (matches nosso default `atPeriodEnd: true`).
   - **Subscriptions → Switch plans:** OFF inicialmente (UI ainda não está pronta para apresentar o catálogo). Habilitar quando suportarmos upgrade/downgrade self-service.
3. **Business information:** privacy policy URL + terms URL (Stripe exige para Portal funcionar).
4. **Branding:** Settings → Branding (compartilhado com Checkout). Logo, cores.
5. Save.

### 4.2 Ativação no app

`billing.createPortalSession({ subject, returnUrl })` faz tudo automaticamente — apps só precisam expor um botão na UI que chama isso via server action e redireciona para a `url` retornada.

### 4.3 Validação

Em test mode: criar uma subscription test, em UI do app clicar "Gerenciar plano", confirmar que abre `https://billing.stripe.com/...`, voltar via "Return to Platform" → confirmar redirect para `returnUrl`.

---

## 5. Cron jobs (5 sweepers)

Pattern Railway documentado em `@informach/auth/PRODUCTION.md` §7. Resumo dos jobs deste package:

| Job | Cron (UTC) | Endpoint | Sweeper |
|---|---|---|---|
| `billing-release-reservations` | `*/5 * * * *` | `/api/jobs/billing-release-reservations` | `releaseExpiredReservations` |
| `billing-dunning` | `0 */6 * * *` | `/api/jobs/billing-dunning` | `retryDunningEmails` |
| `billing-reconcile` | `0 3 * * *` | `/api/jobs/billing-reconcile` | `reconcileSubscriptions` |
| `billing-expire-bonus` | `30 3 * * *` | `/api/jobs/billing-expire-bonus` | `expireMonthlyBonusCredits` |
| `billing-grant-monthly` | `45 3 * * *` | `/api/jobs/billing-grant-monthly` | `grantPendingMonthlyBonusCredits` |

Todos os 5 endpoints já existem em `apps/agenda-da-turma/src/app/api/jobs/` e `apps/cozya/src/app/api/jobs/`. Cada um:
- Aceita `POST` apenas.
- Valida `Authorization: Bearer ${CRON_SECRET}`.
- Chama o método correspondente em `billing.*`.
- Retorna `Response.json(result)` com contagens.

Start command no Railway `cron-runner-billing-*` (1 service por job × 2 apps = 10 services):
```sh
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://${APP_URL}/api/jobs/billing-reconcile"
```

Configurar **Service → Settings → Cron Schedule** com a expressão da tabela.

### 5.1 Por que 5 jobs separados (e em horários distintos)?

- **`release-reservations` (5min):** reservations de chamadas LLM tem TTL curto (default 600s). Limpar rápido evita "fantasma" de saldo reservado para chamadas que travaram.
- **`dunning` (6h):** balanceia urgência (cliente precisa resolver pagamento) com não-spam. Stripe Smart Retries cobra 4× em 14 dias por padrão — nosso dunning email anuncia isso.
- **`reconcile` (1×/dia, 03h UTC = 00h BRT):** detecta drift Stripe↔DB (webhook perdido, sub deletada manualmente no Dashboard). Roda fora do pico para não competir por DB.
- **`expire-bonus` (1×/dia, 03h30 UTC):** rodar 30min depois do reconcile garante que sub-statuses estão atualizadas antes de expirar bônus mensais.
- **`grant-monthly` (1×/dia, 03h45 UTC):** concede o drip mensal de planos anuais quando `next_credit_grant_at` vence. Fica depois do expire-bonus para manter a leitura operacional em ordem.

### 5.2 Custo Railway

10 cron-runners (5 jobs × 2 apps), cada um imagem `alpine` + `curl`. Custo: ~$0/mês cada (sleep mode entre execuções). Total: $0–$2/mês.

---

## 6. Env vars por app

Mínimo para o billing funcionar:

| Var | Onde se obtém | Notas |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → **Restricted key** (preferível) | Live: `sk_live_...`. Test: `sk_test_...`. NUNCA usar `sk_live` em staging. |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret | Per-endpoint: `whsec_...`. Cada app tem o seu (endpoints diferentes). |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → API keys → Publishable | Opcional. Só se usar Stripe Elements no client (não usamos hoje). `pk_live_...` / `pk_test_...`. |
| `STRIPE_MODE` | Manual (opcional) | `dev` ou `prod`. Default infere de `NODE_ENV`. Override útil para apontar staging Railway pra Price IDs prod (rare). |
| `CRON_SECRET` | `openssl rand -base64 32` | Compartilhado entre o app e os cron-runners correspondentes. Mesmo já usado para email crons. |
| `BETTER_AUTH_SECRET` | Reusado | Usado em `buildUnsubscribeToken` para emails billing.* (helper compartilhado com auth/emails). |
| `NEXT_PUBLIC_APP_URL` | Reusado | Compõe `manageBillingUrl`, success/cancel URLs, unsubscribe URL. **HTTPS obrigatório** em prod. |
| `SENDGRID_API_KEY` + `SENDGRID_FROM` | Reusados de `@informach/emails` | Billing emails (`billing.payment-success`, etc) reusam o pipeline existente. |

### 6.1 Restricted Key (recomendado)

Stripe oferece "Restricted keys" com permissões granulares. Para nosso uso, criar uma key com apenas:
- **Customers:** Read + Write
- **Checkout Sessions:** Write
- **Customer Portal:** Write
- **Subscriptions:** Read + Write
- **Payment Intents:** Read
- **Charges:** Read (futuro: Refunds Write se Phase de refunds entrar)
- **Invoices:** Read
- **Webhooks:** Read (não precisa Write — endpoints são criados manualmente)

Tudo o resto: **None**. Reduz blast radius se a key vazar.

### 6.2 Onde configurar no Railway

**Per service** (não shared):
- Service `agenda-da-turma` → Variables → `STRIPE_SECRET_KEY=sk_live_xxx`, `STRIPE_WEBHOOK_SECRET=whsec_xxx_agenda` (do endpoint específico do agenda).
- Service `cozya` → Variables → `STRIPE_SECRET_KEY=sk_live_yyy` (mesma key OK se ambos cobram pela mesma conta Stripe; ou keys distintas se contas Stripe separadas), `STRIPE_WEBHOOK_SECRET=whsec_yyy_cozya`.

> **Nunca commitar Stripe secrets.** O `.env.example` tem placeholders vazios — production fica só no Railway Variables.

---

## 7. Smoke test E2E (pós-deploy)

Após primeiro deploy em prod, validar **em test mode primeiro** (use cards de teste Stripe), depois mudar pra live com cartão real de baixo valor.

```bash
# 1. Em test mode (Stripe Dashboard toggle), navegar até /admin/billing (agenda) ou /settings/billing (cozya).
#    Clicar "Assinar Pro" → redireciona pra Checkout.
#    Usar cartão test: 4242 4242 4242 4242, exp 12/34, CVC 123.
#    Esperado: redirect para successUrl, sub criada.

# 2. Verificar webhooks no DB:
SELECT event_type, processed_at, error FROM billing.webhook_events
WHERE provider='stripe' ORDER BY created_at DESC LIMIT 10;
# Esperado: 3-4 eventos: checkout.session.completed, customer.subscription.created, invoice.paid

# 3. Verificar subscription criada:
SELECT id, status, current_period_end, cancel_at_period_end
FROM billing.subscriptions WHERE provider_subscription_id LIKE 'sub_test_%'
ORDER BY created_at DESC LIMIT 5;
# Esperado: status='active', period_end ~30d a frente

# 4. Verificar email de payment-success (se SENDGRID config OK):
SELECT category, status, recipient, provider_accepted FROM core.email_deliveries
WHERE category = 'billing.payment-success' ORDER BY created_at DESC LIMIT 3;
# Esperado: status='sent'; provider_accepted=true quando webhook SendGrid processar delivered/processed.

# 4b. Verificar auditoria billing.*:
SELECT event_type, actor_id, payload
FROM audit.events
WHERE event_type LIKE 'billing.%'
ORDER BY created_at DESC LIMIT 10;
# Esperado: eventos de checkout/subscription/payment/credits com IDs Stripe, sem payload bruto do webhook.

# 5. Customer Portal: clicar "Gerenciar plano" no UI → abre billing.stripe.com → cancelar → voltar.
#    Esperado: webhook customer.subscription.updated chega com cancel_at_period_end=true.
SELECT cancel_at_period_end FROM billing.subscriptions WHERE provider_subscription_id = 'sub_test_xxx';
# Esperado: timestamp populado.

# 6. Comprar credit pack: cartão 4242, conferir:
SELECT amount_cents, currency, credit_amount, status FROM billing.one_time_payments
ORDER BY created_at DESC LIMIT 1;
# Esperado: paid, credit_amount = N
SELECT SUM(amount) AS balance FROM billing.credit_ledger
WHERE owner_type='user' AND owner_id='<user-id>'
  AND entry_type <> 'expiration'
  AND (expires_at IS NULL OR expires_at > now());
# Esperado: balance = N (créditos disponíveis)

# 7. Failed payment dunning:
#    Trocar para card 4000 0000 0000 9995 (insufficient funds), criar nova sub.
#    Aguardar Stripe trigger invoice.payment_failed (~10s).
SELECT status, metadata->>'dunning' FROM billing.subscriptions
WHERE provider_subscription_id = 'sub_test_xxx';
# Esperado: status='past_due', metadata.dunning.pending=true
# Disparar manualmente o cron de dunning:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://agenda.informach.com.br/api/jobs/billing-dunning
# Esperado: { scanned: 1, sent: 1, skipped: 0 }
# Conferir email billing.payment-failed entregue.

# 8. Idempotência: Resend o mesmo evento via Stripe Dashboard (Webhooks → endpoint → recent events → resend).
#    Esperado: Response 200, log "billing.webhook.deduped", sem efeito colateral duplicado.

# 9. Reconcile: alterar manualmente uma sub local para status divergente (apenas em test):
UPDATE billing.subscriptions SET status='incomplete' WHERE id='<row-id>';
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://agenda.informach.com.br/api/jobs/billing-reconcile
# Esperado: { scanned: N, reconciled: 1, mismatches: 1 } (row local realinhada via retrieve do Stripe).

# 10. Em LIVE mode, repetir #1 com cartão real próprio + valor de R$ 1,00 (criar Price one-shot temporário).
#     Cancelar imediatamente após pagamento, refund manual via Dashboard.
#     Esperado: tudo funciona; refund pode aparecer em billing.payment-failed via charge.refunded
#     (se charge.refunded handler estiver implementado — atualmente não está em Phase 5).
```

---

## 8. Monitoramento contínuo

### No Stripe Dashboard
- **Payments → Successful payments rate:** alvo > 95%. Quedas indicam problema de auth (cartão recusado, fraude).
- **Subscriptions → MRR:** acompanhar mensalmente.
- **Disputes → Open disputes:** alvo 0. Cada dispute custa $15 + reverte o pagamento. Resposta em até 7 dias.
- **Webhooks → endpoint → Recent events:** se `Failed` > 0 em janela de 1h, investigar imediatamente.

### No DB (queries de health)

```sql
-- Subscriptions por status
SELECT provider, status, COUNT(*) FROM billing.subscriptions
GROUP BY provider, status ORDER BY 1, 2;

-- Webhooks com erro nas últimas 24h
SELECT event_type, error, COUNT(*) FROM billing.webhook_events
WHERE error IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type, error ORDER BY 3 DESC;

-- Saldo total ativo (créditos não-expirados não-consumidos)
SELECT owner_type, COUNT(DISTINCT owner_id) AS owners,
       SUM(amount) AS total_credits
FROM billing.credit_ledger
WHERE (expires_at IS NULL OR expires_at > now())
GROUP BY owner_type;

-- Reservations pendentes (active não-expiradas)
SELECT COUNT(*), SUM(estimated_amount)
FROM billing.credit_reservations
WHERE status='active' AND expires_at > now();

-- Receita do mês (cents) — credits packs apenas, NÃO inclui MRR de subs (vai pelo Stripe)
SELECT SUM(amount_cents) / 100.0 AS revenue_brl
FROM billing.one_time_payments
WHERE status='paid' AND paid_at >= date_trunc('month', NOW());
```

### Sentry (quando ativo)

`createBillingService` aceita `logger: Logger`, mas o package não importa Sentry. Nos apps, use o adapter app-level:

```ts
import { logAuditEvent } from "@informach/auth";
import { createBillingService, type BillingAuditEvent } from "@informach/billing";
import { packageLogger } from "./observability";

function billingAudit(event: BillingAuditEvent): void {
  logAuditEvent(event.eventType, event.actorId, event.payload).catch(() => undefined);
}

createBillingService({
  // ...
  logger: packageLogger,
  onAudit: billingAudit,
});
```

`packageLogger` mantém logs estruturados no pino e duplica `warn`/`error` sanitizados para `Sentry.captureMessage`. `debug`/`info` ficam só nos logs estruturados. Configure `SENTRY_DSN`, `enableLogs` e `tracesSampleRate` no app quando quiser logs/spans no Sentry.

`onAudit` persiste eventos `billing.*` em `audit.events` via `@informach/auth.logAuditEvent`. O package não grava auditoria direto no DB para evitar acoplamento com auth; a persistência continua best-effort. Falhas de insert aparecem como `auth.audit.persist_failed` na observabilidade do app. Payload de auditoria deve registrar IDs, status e valores necessários para rastreabilidade, nunca payload bruto Stripe, tokens, secrets ou dados de cartão; ver [`docs/audit-payload-policy.md`](../../docs/audit-payload-policy.md).

Eventos críticos a alertar:
- `billing.webhook.dispatch_error` — webhook handler levantou exception (Stripe vai retentar; se persistente, bug)
- `billing.webhook.invalid_signature` — sinal de tentativa de spoof OU `STRIPE_WEBHOOK_SECRET` errado
- `billing.subscription.lgpd_cancel_error` — falha no cancel quando user deletou conta (compliance issue)
- `auth.account_deletion.billing_partial` (do app) — cancel parcial em LGPD delete

---

## 9. Rollback strategies

### Webhook handler com bug (after deploy)

Reverter o deploy: Railway → Deployments → previous deploy → **Redeploy**. Stripe vai retentar webhooks que falharam até 3 dias — quando deploy bom voltar, eles re-processam automaticamente via idempotência.

### Stripe API key vazada

1. **Stripe Dashboard → API keys → Roll secret key** (gera nova, invalida a antiga em ~30s).
2. Atualizar `STRIPE_SECRET_KEY` no Railway → Deploy.
3. Investigar logs para identificar uso anômalo.
4. Se houve fraude: Disputes → cooperar com Stripe.

### Webhook secret vazado

Stripe NÃO permite rotacionar `whsec_*` diretamente. Solução:
1. Criar **novo endpoint** com mesma URL (Stripe permite duplicates).
2. Copiar o novo `whsec_xxx`.
3. Atualizar `STRIPE_WEBHOOK_SECRET` no Railway → Deploy.
4. Após confirmar webhooks chegando no novo, **deletar o endpoint antigo** no Dashboard.

### Subscription criada mas DB não persistiu (webhook missed)

```bash
# Forçar reconcile manual pra um sub específico (bypass cron):
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://agenda.informach.com.br/api/jobs/billing-reconcile
# Ou em SQL, recriar manualmente via Stripe Dashboard data:
INSERT INTO billing.subscriptions (...) VALUES (...) ON CONFLICT DO NOTHING;
```

### Credit grant duplicado (idempotência falhou — bug raro)

Se aparecer entry duplicada no `credit_ledger` para o mesmo `stripe_event_id`:
```sql
-- Insert compensatório negativo manual
INSERT INTO billing.credit_ledger
  (owner_type, owner_id, entry_type, amount, metadata)
VALUES ('user', '<id>', 'adjustment', -<amount>,
        '{"reason":"duplicate_grant_correction","duplicateLedgerId":"<id>"}'::jsonb);
-- Audit em audit.events com payload minimo; sem payload bruto Stripe:
INSERT INTO audit.events (event_type, actor_id, payload)
VALUES ('billing.credits_refunded', NULL,
        '{"reason":"manual_duplicate_correction","amount":<amount>}'::jsonb);
```

---

## 10. Compliance e considerações fiscais (BR)

### 10.1 PCI scope

Usamos **Stripe Checkout** + **Customer Portal** — UI de pagamento hospedada pelo Stripe. Não passa cartão pelo nosso servidor. Isso nos mantém em **PCI SAQ-A** (mais simples, sem auditoria anual obrigatória).

**NÃO mudar para** Stripe Elements/Payment Element no client side sem revisar PCI scope — Elements ainda mantém SAQ-A com fingerprint de domínio, mas exige headers TLS estritos e testes anuais.

### 10.2 NF-e / Notas fiscais (escopo do operador)

Stripe NÃO emite NF-e brasileira automaticamente. Opções:
1. **Manual:** operador exporta `billing.one_time_payments` + `billing.subscriptions` mensalmente, emite NF-e via emissor próprio (NFe.io, eNotas, etc).
2. **Integração:** plugar emissor de NF-e nos webhook handlers `payment_intent.succeeded` e `invoice.paid` (fora do escopo deste package — adicionar em fase futura).
3. **Stripe Tax (futuro):** Stripe oferece Tax automation para alguns países, **não BR** ainda. Acompanhar.

**Retenção fiscal:** rows em `billing.{customers,subscriptions,oneTimePayments,creditLedger}` devem ser retidas **5+ anos** por exigência fiscal/Receita Federal. Por isso `cancelBillingForSubject` (LGPD hook) cancela subs mas NÃO deleta rows. Backups Postgres devem ter retenção compatível.

### 10.3 LGPD

- **Right to be forgotten:** auth `accountDeletion.onBeforeDelete` chama `billing.cancelBillingForSubject`. PII em outras tabelas é responsabilidade do app anonimizar. `subjectId` em billing rows é retido — não é PII isolada (é um UUID), só vincula a histórico fiscal.
- **Data export:** considerar futuramente — `billing.getCreditHistory` já permite export programático. Stripe Dashboard exporta invoice history para o cliente.

### 10.4 Termos e privacidade

- **Privacy policy URL** + **Terms URL** obrigatórios no Stripe (Settings → Public details) — usados no Customer Portal e Checkout.
- Mencionar billing/cancelamento/refund explicitamente nos Terms.

---

## 11. Limites e custos

### Stripe (BR)

- **Cartão:** 3.99% + R$0,39 por transação (international cards 4.99% + R$0,39).
- **Pix:** 0.99% por transação (sem fixo). Quando habilitar.
- **Subscription billing:** sem custo extra (incluído no fee per-transaction).
- **Customer Portal:** grátis.
- **Stripe Tax:** N/A no BR ainda.
- **Disputes:** $15 por dispute (vai do balance).

### Rate limits Stripe API

- **Read endpoints:** 100 req/s.
- **Write endpoints:** 100 req/s.
- **Test mode:** 25 req/s.

Não atingimos hoje (usuário cria 1 checkout por click, webhooks são event-driven). Em alta carga, considerar batch + cache de products no startup (já fazemos via `config.products`).

### Railway

- **App service:** dimensionar conforme tráfego (Hobby Plan US$5/mês cobre staging; Pro a partir de US$20/mês).
- **Postgres:** tabelas de billing são pequenas (subscriptions/payments com poucos rows; ledger cresce mas índices em `owner_type+owner_id+created_at` mantêm queries rápidas mesmo com milhões de rows).
- **10 cron-runners** (5 jobs × 2 apps): ~$0–$2/mês total (sleep mode).

---

## 12. Lista pré-deploy

Checklist final antes do primeiro pagamento real:

### Stripe Dashboard
- [ ] Conta ativada em live mode (account approved).
- [ ] Statement descriptor configurado.
- [ ] Public details (logo, suporte) preenchidos.
- [ ] Privacy + Terms URLs configurados.
- [ ] Products + Prices criados (test E live), Price IDs em `packages/config/src/products.ts`.
- [ ] Webhook endpoint adicionado (live), 7 eventos selecionados, signing secret copiado.
- [ ] Customer Portal configurado (Functionality habilitado).
- [ ] Pagamentos: cartão ON; Pix decidido (ON ou ON-futuro).
- [ ] Restricted API key criada (não usar Full Access).

### Railway / app
- [ ] `STRIPE_SECRET_KEY` (live) setada em ambos services.
- [ ] `STRIPE_WEBHOOK_SECRET` (live, **per-app**) setada — diferente para cada service.
- [ ] `STRIPE_MODE` = `prod` (ou ausente — default infere).
- [ ] `CRON_SECRET` setado (mesmo já usado para email crons).
- [ ] 5 cron-runners por app criados (`billing-release-reservations`, `billing-dunning`, `billing-reconcile`, `billing-expire-bonus`, `billing-grant-monthly`), cada um com Cron Schedule.
- [ ] `pnpm db:migrate` aplicado em prod (incluindo migrations do schema `billing`, até `0014_robust_skaar.sql`).
- [ ] Custom domain (opcional mas recomendado) para Checkout: `checkout.informach.com.br` validado.
- [x] `onAudit` app-level plugado no `createBillingService` para persistir `billing.*` em `audit.events`.

### Validação
- [ ] Smoke test E2E §7 passou em test mode.
- [ ] 1 transação real de R$ 1,00 em live mode passou (refund manual após confirmar).
- [ ] Webhooks chegando em `billing.webhook_events` com `error` IS NULL.
- [ ] Email `billing.payment-success` entregue (inspecionar inbox).
- [ ] Customer Portal abre + retorna corretamente.
- [ ] Cron `billing-reconcile` executou ao menos 1x sem erro.

### Compliance
- [ ] Plano de emissão de NF-e definido (manual ou integração).
- [ ] Backup Postgres com retenção ≥ 5 anos configurado.
- [ ] LGPD hook `accountDeletion.onBeforeDelete` wirado em ambos apps.
- [ ] Terms + Privacy menciona billing/cancelamento/refund.
- [x] Adapter app-level de Sentry plugado no logger de `createBillingService`; confirmar `SENTRY_DSN` e alertas no ambiente desejado.

---

## 13. Quick reference: comandos Stripe CLI úteis

Stripe CLI é a forma canônica de testar webhooks em dev. Instalação: <https://stripe.com/docs/stripe-cli>.

```bash
# Login (uma vez)
stripe login

# Forward webhooks de Stripe → localhost durante dev
stripe listen --forward-to localhost:3001/api/webhooks/stripe
# (Copiar o whsec_xxx exibido para STRIPE_WEBHOOK_SECRET local.)

# Disparar evento sintético (test mode)
stripe trigger payment_intent.succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted

# Replay um evento real do Dashboard
stripe events resend evt_xxx

# Listar últimos 10 eventos
stripe events list --limit 10

# Inspecionar uma subscription
stripe subscriptions retrieve sub_xxx

# Test cards comuns:
# 4242 4242 4242 4242 — sucesso
# 4000 0000 0000 0341 — falha attach (sub fica incomplete)
# 4000 0000 0000 9995 — insufficient_funds (failed payment, dispara dunning)
# 4000 0025 0000 3155 — exige 3DS (Strong Customer Authentication)
```

---

## Referências cruzadas

- **Auth deploy** (Railway services, CSP, Redis, cron pattern genérico): `@informach/auth/PRODUCTION.md`.
- **Email pipeline production:** `@informach/emails/PRODUCTION.md`.
- **Arquitetura interna do package:** `@informach/billing/CLAUDE.md`.
- **Política de payload de auditoria:** `docs/audit-payload-policy.md`.
- **Stripe API changelog (Basil → Dahlia):** memory `stripe_api_basil_changes.md`.
- **Stripe Dashboard:** <https://dashboard.stripe.com>
- **Stripe CLI:** <https://stripe.com/docs/stripe-cli>
- **Stripe webhook events:** <https://stripe.com/docs/api/events/types>
- **Railway Cron Schedule docs:** <https://docs.railway.com/reference/cron-jobs>
