---
status: resolved
file: packages/billing/src/webhooks/subscription.ts
line: 264
severity: medium
author: claude-code
provider_ref:
---

# Issue 008: Deduplicar avisos de cancelamento por transição

## Review Comment

O handler envia `billing.subscription-canceled` para qualquer `customer.subscription.updated` que ainda tenha `cancel_at_period_end`, sem verificar se esse campo acabou de mudar de falso para verdadeiro. Para esses eventos, `canceled_at` normalmente é nulo e a chave usa `new Date().toISOString()`. Portanto, cada atualização posterior da mesma assinatura enquanto o cancelamento continua agendado gera uma chave nova e outro e-mail. A deduplicação por ID de webhook protege apenas a repetição do mesmo evento, não eventos distintos sobre a mesma assinatura.

Carregar o estado anterior antes do upsert e enviar o aviso somente na transição para cancelamento agendado. Usar uma chave estável da operação — por exemplo, assinatura e término do período — e permitir um novo aviso somente depois de uma reativação real seguida de outro cancelamento. Definir também se o `deleted` final deve produzir uma segunda mensagem ou apenas confirmar o encerramento com texto próprio, e cobrir a sequência com testes.

## Triage

- Decision: `RESOLVED`
- Notes: Os avisos usam a transição real de cancel_at_period_end e chaves estáveis por assinatura/período ou encerramento; repetições do mesmo webhook não reenviam a mensagem.
