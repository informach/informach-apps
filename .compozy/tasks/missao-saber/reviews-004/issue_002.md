---
status: resolved
file: apps/missao-saber/src/app/api/webhooks/sendgrid/route.ts
line: 15
severity: medium
author: claude-code
provider_ref:
---

# Issue 002: Preservar a categoria da preferência no webhook de e-mail

## Review Comment

Na versão inicialmente revisada, `eventSchema` não declarava `category` nem `user_id`. O parse de `z.object()` remove esses campos antes de chamar `processEmailEvents`. Entretanto, `@informach/emails/webhook` usa os dois em `recordUnsubscribe`: sem categoria, grava `marketing.all`, enquanto a política de envio consulta a categoria exata. Portanto um evento assinado de cancelamento de recebimento de `billing.payment-failed` perde sua categoria e não impede novos avisos de cobrança dessa categoria. A busca alternativa por e-mail pode recuperar o usuário, mas não recupera a categoria.

Preservar e validar os campos necessários ao contrato compartilhado antes de despachar o evento. Testar a fronteira HTTP assinada até a persistência da preferência e o bloqueio de uma tentativa de envio subsequente, além da rejeição de assinatura inválida.

## Triage

- Decision: `VALID`
- Notes: Schema preserva `category` e `user_id`. Teste real da rota gera chave ECDSA, assina timestamp+payload e confirma a preferência `billing.payment-failed` em PostgreSQL, inclusive replay e rejeição de assinatura ausente. Política compartilhada consulta a mesma categoria. Integração independente: 13/09/2026 11:43:15 America/Sao_Paulo, 14 testes aprovados, exit 0; banco descartável removido.
