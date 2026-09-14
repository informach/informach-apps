---
status: resolved
file: apps/missao-saber/src/features/product-metrics/repository.ts
line: 68
severity: medium
author: claude-code
provider_ref:
---

# Issue 006: Exigir um fato de confirmação para contar assinatura

## Review Comment

`subscription.status not in ('incomplete', 'incomplete_expired')` considera toda linha `canceled` como “Assinatura confirmada”, embora cancelamento não prove confirmação anterior. Há um caminho concreto no próprio sistema: uma assinatura local `incomplete` sem primeiro pagamento é encerrada por `closeRemoteBillingForSubject()`, que aplica `status: "canceled"` a todas as linhas do customer (`packages/billing/src/subscriptions.ts:285–296`). Esse cliente passa a incrementar a conversão apenas por encerrar a conta, sem ter alcançado o marco comercial. F5.5 pede confirmação real da assinatura, não inferência por exclusão de dois estados atuais.

Persistir ou consultar um marco positivo e idempotente de confirmação, definido de acordo com a política do produto, como primeira ativação/pagamento confirmado. Esse fato deve continuar verdadeiro após o cancelamento de uma assinatura que de fato foi confirmada, e continuar falso para quem cancelou sem confirmar. Especificar o tratamento de trial, se suportado, no documento das métricas. Manter o isolamento do customer por app e a deduplicação/exclusão de contas técnicas.

Acrescentar regressões para `incomplete → canceled` sem confirmação (zero), confirmação → cancelamento (uma conversão) e múltiplas assinaturas/eventos do mesmo responsável (uma). O fixture atual de métricas insere apenas `active` e não cobre a diferença entre estado atual e histórico do marco.

## Triage

- Decision: `RESOLVED`
- Notes: A métrica usa subscriptions.confirmed_at, gravado por ativação ou trial confirmado ou invoice.paid e preservado após cancelamento. Assinaturas incomplete encerradas não entram; a migration faz backfill somente de estados já confirmados.
