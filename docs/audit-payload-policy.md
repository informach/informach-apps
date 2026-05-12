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

## Billing

Eventos de billing devem registrar o ator quando a ação veio de usuário autenticado e usar payloads transacionais. `billing.checkout_started` deve incluir `checkoutSessionId`, `productId`, `subjectType`, `subjectId` e `mode`; compras de créditos podem incluir `creditAmount`. Motivos de cancelamento devem vir de enum controlado, não de texto livre.

`billing.credits_warning_sent` (notificações 50%/80%/100% do cap mensal): payload deve conter `subjectType`, `subjectId`, `threshold` (50|80|100), `remaining`, `total`, `periodStart` (ISO date) e `messageKey` para correlação com `email_deliveries`. Não gravar email bruto — usar `emailHash`/`emailDomain` se necessário (mesma regra de `email.*`).

## Observabilidade

- Sentry/APM deve receber `payloadKeys`, `eventType`, `actorId` e erro sanitizado, não o payload completo.
- Falha de persistência do audit permanece best-effort e deve ser reportada via `observability.onAuditPersistenceFailure`.
- Novo evento exige atualizar a union `AuditEventType`, a union do package emissor quando existir, docs e testes de wiring.

## Eventos da Agenda da Turma

Eventos `agenda.*` registram mutações de domínio do app `agenda-da-turma` com payload mínimo de IDs e flags operacionais. Não gravar nomes de estudantes, nomes de matérias, títulos, descrições ou conteúdo livre de atividades.

Eventos atuais:

- `agenda.student_profile_created`, `agenda.student_profile_updated`, `agenda.student_profile_deleted`
- `agenda.turma_created_or_joined`, `agenda.turma_joined_by_code`, `agenda.turma_set_active`, `agenda.turma_left`, `agenda.turma_updated`, `agenda.turma_deleted`
- `agenda.subject_created`, `agenda.subject_updated`, `agenda.subject_deleted`
- `agenda.activity_created`, `agenda.activity_updated`, `agenda.activity_deleted`, `agenda.activity_status_set`, `agenda.activity_shared_response`
