---
status: resolved
file: packages/billing/src/plan-changes.ts
line: 130
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Desfazer o cancelamento ao substituir um downgrade por upgrade

## Review Comment

O responsável pode agendar Família mensal → Individual mensal e, antes do fim do período, escolher Família anual. A tela continua oferecendo essa troca imediata mesmo com um plano pendente (`familia/page.tsx:99–115`, `family-controls.tsx:342–387`). No caminho imediato, `switchPlan()` limpa `pendingProductId/pendingPriceId`, mas mantém `cancelAtPeriodEnd` quando o provedor devolve o sinalizador ativo. O adapter Stripe apenas altera preço, prorrata e comportamento do pagamento (`providers/stripe.ts:277–285`); ele não desfaz o cancelamento usado para implementar o downgrade anterior.

Consequentemente, a cobrança do upgrade pode ser confirmada e o plano atualizado, mas a assinatura continua programada para encerrar. Quando termina, não existe mais intenção pendente para criar a substituta. Uma reprodução da função real, injetando o estado retornado pelo provedor para uma assinatura ainda agendada, confirmou `remainsScheduled: true` e `pendingCleared: true`.

A Stripe exige atualizar explicitamente `cancel_at_period_end` para `false` para interromper um cancelamento agendado; atualizar outro campo não faz isso nas versões atuais. Referência: [Stop a pending cancellation](https://docs.stripe.com/billing/subscriptions/cancel#stop-a-pending-cancellation).

Modelar a substituição da intenção anterior como parte da troca: desfazer ou reconciliar o cancelamento remoto e limpar a intenção somente depois de confirmar o novo estado, incluindo o caminho em que o pagamento exige ação posterior. Como alternativa explícita de produto, impedir outra troca enquanto a intenção anterior não tiver sido desfeita com sucesso. Cobrir downgrade agendado seguido de upgrade, cobrança imediata e cobrança com ação pendente, e verificar que a assinatura passa a renovar como solicitado.

Esse cenário é diferente da durabilidade da intenção corrigida em011/009: a perda aqui acontece em uma operação posterior bem-sucedida.

## Triage

- Decision: `UNREVIEWED`
- Notes:

## Resolution

O produto adotou a alternativa explícita do review: enquanto existe alteração agendada ou cancelamento no fim do período, nenhuma nova troca é oferecida ou aceita pelo serviço. A família usa primeiro “Manter assinatura atual”, que limpa a intenção local e o `cancel_at_period_end` remoto; em seguida escolhe o novo plano. Essa sequência evita combinar campos incompatíveis com `payment_behavior=pending_if_incomplete`. O pacote de billing passou em `197` testes e a homologação com a Stripe real em modo teste confirmou downgrade agendado, reativação remota, upgrade anual, novo downgrade, renovação, falha e cancelamento (`runId a9ed9e2f-beaf-424e-983f-6cf2d6452f94`).
