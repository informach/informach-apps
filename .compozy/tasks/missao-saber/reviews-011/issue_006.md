---
status: resolved
file: apps/missao-saber/scripts/sendgrid-delivery-test.mjs
line: 27
severity: medium
author: claude-code
provider_ref:
---

# Issue 006: Validar os e-mails produzidos pelos fluxos reais

## Review Comment

Este é um déficit de homologação, não uma falha comprovada de entrega. `sendgrid-delivery-test.mjs` monta três mensagens de autenticação manualmente, com códigos fixos, e depois compara o destinatário no banco e na Activity API. Esses códigos não pertencem a desafios criados pelo auth e não podem validar confirmação, login ou recuperação. O script separado `sendgrid-provider-test.mjs` solicita login e recuperação pela interface, mas não conclui os desafios nem correlaciona esses envios com a entrega final no coletor assinado. Nenhum dos dois exercita as mensagens de pagamento, renovação, inadimplência e cancelamento geradas pelo lifecycle real.

Homologar mensagens originadas pelos próprios fluxos: criar o desafio, correlacionar `providerMessageId`, confirmar entrega pelo coletor assinado e, quando o destinatário autorizado permitir, usar o código recebido para concluir confirmação/login/recuperação. Usar a assinatura Stripe de teste para produzir e conferir as categorias de billing, seus links para o app, idempotência e preferências. Registrar evidência redigida e reprodutível em `evidencias/fase-04.md`.

## Triage

- Decision: `UNREVIEWED`
- Notes:

## Resolution

Após o deploy do coletor compartilhado, os fluxos reais do Missão Saber enviaram OTPs pelo SendGrid para a caixa autorizada. Os códigos criados pelo Better Auth foram lidos no Redis operacional e usados para confirmar o cadastro, concluir login por código, redefinir a senha e entrar com a nova senha. O ledger recebeu `delivered` nas três categorias, com aceitação e ID do provedor; a Activity API também confirmou entrega. A conta e as chaves temporárias foram removidas. A homologação Stripe gerou as mensagens de billing pelo lifecycle real em sandbox, e os `111` testes de e-mail validam seus contratos, links, idempotência e transições.
