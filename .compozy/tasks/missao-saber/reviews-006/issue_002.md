---
status: resolved
file: packages/billing/src/webhooks/invoice.ts
line: 419
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Isolar eventos de fatura pelo app do cliente de cobrança

## Review Comment

`loadLocalSubscriptionWithSubject()` encontra a assinatura pelo provider/ID, mas não filtra `customers.app`. `handleInvoicePaymentFailed()` usa essa linha e a altera para `past_due` sem sequer resolver o produto no catálogo do app. O novo `handleBillingEvent()` também delega ao dispatcher quando o cliente não pertence a Missão Saber. Um evento de fatura válido de Cozya ou Agenda recebido pelo novo endpoint pode, portanto, modificar a assinatura de outro produto. O sentido inverso também quebra o fechamento corrigido em F4: um evento antigo de falha de Missão entregue a outro serviço de billing não optante por `guardClosedBilling` pode mudar uma assinatura encerrada para `past_due` e restabelecer sua fila de cobrança.

Aplicar a identidade do app na consulta local e na recuperação de assinatura, ou rejeitar clientes de outro app no dispatcher compartilhado antes de qualquer mutação. A proteção deve valer para todos os serviços que usam essa fronteira, sem depender apenas da configuração opt-in de encerramento. Testar com banco real duas instâncias de serviço com apps diferentes: evento de Cozya recebido por Missão não altera Cozya; evento de uma assinatura encerrada de Missão recebido pelo outro serviço não altera estado nem fila de dunning. Nenhum teste precisa chamar Stripe real.

## Triage

- Decision: `VALID`
- Notes: Consulta e recuperação de assinatura agora filtram `customers.app`, e o boundary de Missão rejeita clientes estrangeiros/desconhecidos antes do dispatcher. Revisor conferiu o diff e executou independentemente `pnpm --filter @informach/missao-saber test:integration` em 13/09/2026 às 11:52:34 America/Sao_Paulo: 15 testes em dois arquivos aprovados, exit 0. O novo caso cobre as duas direções com serviços de apps distintos e banco real, preservando estado e dunning. Banco descartável removido. Implementador também reportou 188 testes compartilhados de billing aprovados às 11:48:49 após a correção.
