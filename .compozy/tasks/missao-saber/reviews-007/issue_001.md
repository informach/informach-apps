---
status: resolved
file: apps/missao-saber/src/features/billing/service.ts
line: 72
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Impedir dois checkouts pagáveis para o mesmo responsável

## Review Comment

O lock de `checkout()` termina quando a URL é criada. O serviço compartilhado (`packages/billing/src/checkout.ts:63`) consulta somente assinaturas locais já ativas e sua chave idempotente inclui produto e janela de cinco minutos. Antes de pagar, o responsável pode abrir Individual mensal em uma aba e Família mensal em outra, ou repetir o mesmo produto em outra janela. As chamadas sequenciais passam pelo lock e criam duas sessões que continuam pagáveis. Concluir ambas pode gerar duas cobranças recorrentes; o acesso local escolhe apenas uma assinatura com `limit(1)`.

Reprodução nesta revisão: catálogo real com preços de fixture, funções reais de checkout/customer, PostgreSQL descartável migrado e provedor controlado. Duas chamadas sequenciais do mesmo cliente retornaram `cs_1` e `cs_2`, `providerCalls=2`, `differentKeys=true`. Não houve pagamento real. Evidências completas no [mapa independente](../reviews/dependency-map-review-2.md).

Persistir o ciclo do checkout por cliente/app, retomando uma sessão compatível ainda aberta ou expirando a anterior antes de oferecer outra. Consultar o provedor para resolver pagamento já concluído cujo webhook ainda não chegou. Cobrir troca de produto, passagem da janela de idempotência, resposta perdida e concorrência. Considerar também a exclusão da conta compartilhada, cujas proteções atuais enxergam assinaturas locais, mas não checkouts pendentes.

Esta raiz é distinta de `reviews-004/issue_001`: o encerramento já expira checkouts; a duplicação aqui acontece sem nenhuma exclusão.

## Triage

- Decision: `VALID`
- Notes: Causa: a idempotência cobria apenas a criação da URL. Correção: intenção persistente por cliente, chave e parâmetros estáveis, recuperação de resposta perdida, verificação remota e expiração de links anteriores. A FK operacional permanece durante todo o ciclo pagável; apenas confirmação remota de encerramento/expiração libera a identidade. Reserva ainda não enviada não inicia checkout durante webhook. Extensão necessária: provider/factory, schema e migração 0042, encerramento e guards globais de Cozya/Agenda. A exceção operacional à ausência de FK de owner financeiro está motivada no ADR 0001.
- Verification: [relatório da remediação](../reviews/remediation-007.md) e [revisão independente](../reviews/remediation-007-independent.md). Testes finais, lint focado, typecheck, migração descartável e build aprovados; check global fora do escopo continua falhando e está discriminado no relatório.
