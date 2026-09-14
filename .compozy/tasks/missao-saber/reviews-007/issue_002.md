---
status: resolved
file: apps/missao-saber/src/features/billing/maintenance.ts
line: 9
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Coordenar a reconciliação com o encerramento da assinatura

## Review Comment

`maintainBilling()` executa a reconciliação fora do `withBillingLifecycle` usado por checkout, encerramento e webhooks. O sweeper captura candidatos, aguarda Stripe e atualiza por ID (`packages/billing/src/sweepers.ts:450`), sem verificar a versão local ou `closedSubscriptionIds`. Uma resposta que representava o estado remoto antes do encerramento pode chegar depois dele e sobrescrever `canceled` com `active`. A família recriada recupera acesso pago indevido e a interface contradiz o encerramento confirmado. Isso restaura o estado local; não foi demonstrada reativação da cobrança na Stripe.

Reprodução em PostgreSQL descartável: assinatura local `past_due`; resposta remota `active` retida; encerramento gravou `canceled` e o ID em `closedSubscriptionIds`; liberar a resposta fez o sweeper gravar `active`, com `reconciled=1`, sem erros. Ver [evidência independente](../reviews/dependency-map-review-2.md).

Incluir os escritores do job no protocolo de ciclo de vida por responsável, recarregando o estado sob coordenação e respeitando o encerramento antes de persistir. Uma alternativa precisa usar gravação condicional capaz de rejeitar a resposta obsoleta; verificar o estado apenas antes do `await` não resolve. Conferir também o processamento de dunning, que usa candidatos capturados fora da coordenação. Testar resposta atrasada e encerramento concorrente. A orientação de não sobrepor jobs não evita a concorrência com a ação da família.

Raiz nova: escritor de reconciliação fora da coordenação; não repete o problema anterior do pool ou do isolamento de faturas.

## Triage

- Decision: `VALID`
- Notes: Causa: jobs usavam candidatos antigos fora da coordenação de encerramento. Correção: mesmo lock por responsável durante releitura, chamada remota, gravação e envio; estado elegível e tombstones conferidos após adquirir o lock. Extensão necessária: hook opt-in no serviço compartilhado e testes de integração com respostas/envios atrasados.
- Verification: [relatório da remediação](../reviews/remediation-007.md) e [revisão independente](../reviews/remediation-007-independent.md). Testes finais, lint focado, typecheck, migração descartável e build aprovados; check global fora do escopo continua falhando e está discriminado no relatório.
