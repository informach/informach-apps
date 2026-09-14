---
status: resolved
file: apps/missao-saber/src/app/api/webhooks/sendgrid/route.ts
line: 22
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Aceitar categorias em array nos eventos do SendGrid

## Review Comment

A rota valida `category` somente como string. Porém o dispatcher (`packages/emails/src/dispatch.ts:379`) envia `categories: [input.category]`, e o SendGrid documenta que categorias enviadas em array retornam em array no webhook. O resultado é rejeitar o lote inteiro com `400 Invalid events`, antes de processar entregas, bounces ou descadastros. O teste de integração existente envia apenas string e não representa esse contrato. [Referência oficial do Event Webhook](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event).

Reprodução com a função POST real, chave ECDSA local, assinatura válida e timestamp atual: um evento `bounce` com `category: ["billing.payment-failed"]` retornou `400 Invalid events`; nenhum acesso ao banco ocorreu. O payload passou pela verificação criptográfica e falhou no schema. Ver [evidência independente](../reviews/dependency-map-review-2.md).

Aceitar e normalizar string/array conforme o provedor e resolver a categoria interna pelo registro da entrega ou por argumento próprio sem colisão com `category`. O tipo compartilhado `SendgridEvent` e `recordUnsubscribe` também precisam receber uma representação coerente, sem converter arrays implicitamente em strings. Testar o payload assinado documentado, lotes e persistência de supressão/descadastro.

Raiz distinta de `reviews-004/issue_002`: os campos agora são preservados, mas o tipo declarado rejeita payload legítimo.

## Triage

- Decision: `VALID`
- Notes: Causa: contrato local aceitava apenas string, embora o dispatcher envie arrays de categorias. Correção: os três parsers aceitam string/array e preservam informach_category; normalização compartilhada prioriza a entrega persistida. Extensão necessária: dispatcher/webhook compartilhados e parsers de Cozya/Agenda, evitando colisão com campo do provedor e regressão em outros apps.
- Verification: [relatório da remediação](../reviews/remediation-007.md) e [revisão independente](../reviews/remediation-007-independent.md). Testes finais, lint focado, typecheck, migração descartável e build aprovados; check global fora do escopo continua falhando e está discriminado no relatório.
