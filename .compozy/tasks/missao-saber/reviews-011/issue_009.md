---
status: resolved
file: packages/billing/src/plan-changes.ts
line: 156
severity: high
author: claude-code
provider_ref:
---

# Issue 009: Tornar o downgrade agendado durável e recuperável

## Review Comment

O fluxo agenda o cancelamento remoto antes de persistir `pendingProductId` e
`pendingPriceId`. Uma falha de processo ou de banco entre essas duas operações
deixa a assinatura cancelando na Stripe sem a intenção local necessária para
criar o plano inferior ao fim do período. Nesse estado, o webhook de exclusão
trata a assinatura como um cancelamento comum e revoga o acesso pago.

Há uma segunda janela de perda quando o webhook aplica a intenção pendente. O
tratamento atual captura qualquer erro de `createSubscription`, limpa a intenção
e confirma o webhook. Isso também inclui timeout, resposta 5xx ou perda da
resposta depois de a Stripe ter criado a nova assinatura. O cliente pode então
ficar com uma cobrança remota sem assinatura local e sem acesso; a reconciliação
parte dos registros locais e o bloqueio de checkout remoto impede uma recuperação
normal.

Persista a intenção de downgrade antes de alterar a assinatura remota e modele a
troca como uma operação recuperável. Erros transitórios ou de resultado
desconhecido devem manter a intenção para repetição idempotente e consultar a
Stripe pelo cliente e pela chave de idempotência antes de decidir criar outra
assinatura. Limpe a intenção apenas depois de confirmar o estado final local e
remoto. Cubra a interrupção entre persistência e cancelamento, timeout após
criação remota e repetição de `customer.subscription.deleted`.

Referências relacionadas:

- `packages/billing/src/plan-changes.ts:156-172`
- `packages/billing/src/webhooks/subscription.ts:433-478`

## Triage

- Decision: `RESOLVED`
- Notes: A intenção é persistida antes da chamada remota, permanece após falha e usa idempotência estável na repetição. A aplicação só limpa a intenção após confirmar a nova assinatura e reutiliza o meio de pagamento da assinatura substituída; a homologação real confirmou a troca.
