# Política de payload para `audit.events`

`audit.events` é o log operacional/compliance append-only do monorepo. Ele registra quem fez a ação, qual contrato de evento foi emitido e o mínimo de contexto necessário para investigação.

## Retenção

- Retenção padrão: 5 anos, salvo regra legal/produto mais restritiva documentada no app.
- Remoção ou anonimização retroativa exige migration/job explícito e revisão do motivo. Não apagar eventos arbitrariamente em fluxo de runtime.
- Dados fiscais/billing podem ter retenção própria; nesses casos, o payload de audit deve referenciar IDs fiscais/Stripe internos em vez de duplicar PII.

## Campos permitidos

Preferir sempre identificadores e estado transacional:

- IDs internos: `userId`, `organizationId`, `sessionId`, `subscriptionId`, `invoiceId`, `deliveryId`, `messageKey`.
- Classificadores: `category`, `status`, `role`, `reason`, `classification`, `providerEvent`, `source`.
- Chaves de correlação de provider quando não forem secretas: `providerMessageId`, `stripeEventId`, `checkoutSessionId`.
- PII mínima quando a própria identidade é o objeto auditado. Exemplo: eventos de auth como `user.created` podem registrar `email` para rastreabilidade de conta.

## Campos proibidos

Nunca gravar em `audit.events.payload`:

- Senhas, tokens, cookies, secrets, API keys, assinaturas HMAC/ECDSA, headers `Authorization`/`Cookie`.
- Payload bruto de webhook ou request/response integral de provider.
- Conteúdo de email, HTML/texto enviado, anexos, prompts completos ou mensagens de usuário.
- Dados financeiros sensíveis como PAN/cartão, CVV, bank account ou PII fiscal desnecessária.

## Emails e PII

Eventos `email.*` devem usar `emailHash` (SHA-256 do email normalizado) e `emailDomain` quando o destinatário for relevante para compliance, suppression ou unsubscribe. Não gravar email bruto em `email.*`.

Use email bruto apenas nos eventos de auth em que a identidade da conta é o próprio objeto auditado, e mantenha o payload pequeno.

## Observabilidade

- Sentry/APM deve receber `payloadKeys`, `eventType`, `actorId` e erro sanitizado, não o payload completo.
- Falha de persistência do audit permanece best-effort e deve ser reportada via `observability.onAuditPersistenceFailure`.
- Novo evento exige atualizar a union `AuditEventType`, a union do package emissor quando existir, docs e testes de wiring.
