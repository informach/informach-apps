---
status: resolved
file: packages/emails/src/webhook.ts
line: 138
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Não registrar aceitação SendGrid como entrega ao destinatário

## Review Comment

Os eventos `processed` e `delivered` passam pelo mesmo ramo e agora ambos gravam `status = delivered` em `email_deliveries`. `processed` confirma que o SendGrid aceitou a mensagem para envio; a entrega ao servidor destinatário só é confirmada por `delivered`. Referência: [SendGrid Event Webhook Reference](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event).

Reprodução da função real com um único evento `processed` e armazenamento em memória resultou em `writtenStatus: delivered, providerAccepted: true`, sem qualquer evento de entrega. Uma mensagem posteriormente adiada permanece falsamente entregue durante todo o adiamento, porque `deferred` apenas registra um aviso. Um evento `processed` atrasado também pode sobrescrever uma falha terminal. O impacto se estende aos três apps, que compartilham o ledger e o coletor; consultas de evidência e monitoramento deixam de distinguir aceitação de entrega.

Tratar `processed` como confirmação de aceitação sem promover a entrega, manter `delivered` reservado ao evento correspondente e preservar estados terminais contra eventos anteriores/repetidos. Cobrir `processed` isolado, `processed → deferred`, `delivered` e `bounce → processed` fora de ordem. Este é um defeito funcional no coletor, separado da pendência011/006 de homologar os fluxos reais de e-mail.

## Triage

- Decision: `UNREVIEWED`
- Notes:

## Resolution

`processed` agora registra somente a aceitação pelo provedor; apenas `delivered` confirma a entrega. Atualizações de entrega não sobrescrevem `bounced`, `dropped` ou `complained` quando os eventos chegam fora de ordem. A suíte de e-mail passou em `111` testes, incluindo `processed`, `processed → deferred`, `delivered` e `bounce → processed`. Depois do deploy do coletor compartilhado, cadastro, login por OTP e recuperação reais receberam `delivered`, aceitação e ID do provedor; os três desafios foram concluídos e os recursos temporários removidos.
