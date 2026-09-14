---
status: resolved
file: packages/billing/src/webhooks/subscription.ts
line: 192
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Tornar o cancelamento terminal diante de eventos atrasados

## Review Comment

`handleSubscriptionLifecycle()` aplica todo `customer.subscription.created`, `updated` ou `deleted` por `upsert`, sem comparar a criação do evento nem proteger o estado terminal da mesma assinatura. O lock serializa as entregas e a tabela de webhooks elimina a repetição do mesmo ID, mas nenhuma dessas medidas ordena IDs diferentes. Se `customer.subscription.deleted` gravar `canceled` e depois chegar um `customer.subscription.updated` anterior com `status: active`, o `onConflictDoUpdate` volta a linha para `active`; `getProSubscription()` passa então a conceder conteúdo pago a uma assinatura já encerrada. Isso viola diretamente o critério da F4 de não reativar assinatura encerrada com eventos reordenados.

Persistir e comparar uma ordenação canônica do provedor, ou reconciliar o estado atual na Stripe antes de aceitar uma transição contraditória. Para o mesmo `providerSubscriptionId`, `canceled` após `subscription.deleted` deve ser terminal; uma nova contratação possui outro ID. Cobrir pelo menos as sequências `deleted → updated(active)`, `payment_failed → updated(active antigo)` e eventos simultâneos, além da deduplicação do mesmo evento. Como a correção está no pacote compartilhado, executar as regressões de Agenda da Turma e Cozya.

## Triage

- Decision: `RESOLVED`
- Notes: O webhook trava a assinatura, registra o instante do evento, rejeita regressões temporais e não revive uma assinatura terminal. O estado de cobrança pendente prevalece até invoice.paid; testes unitários e PostgreSQL cobrem eventos atrasados e concorrentes.

