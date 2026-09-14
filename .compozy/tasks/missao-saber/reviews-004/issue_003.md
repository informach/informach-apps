---
status: resolved
file: apps/missao-saber/src/features/billing/maintenance.ts
line: 28
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: Não consumir lembrete de cobrança quando o envio falha

## Review Comment

O callback passado a `retryDunningEmails()` aguarda `emails.sendEmail()` e descarta seu resultado. O dispatcher compartilhado resolve normalmente com `{ ok: false, status: "failed" }` depois de uma falha de envio e também pode retornar `deferred` ou `skipped`. Já o sweeper (`packages/billing/src/sweepers.ts:257–279`) interpreta qualquer resolução do callback como envio concluído: incrementa `attempts`, preenche `lastSentAt`, conta `sent` e encerra a sequência ao chegar ao limite. Uma indisponibilidade de SendGrid pode consumir os três lembretes sem que sejam enviados, e a resposta do job reporta sucesso para essas tentativas.

Inspecionar `DispatchResult` e comunicar falha temporária/estado pendente ao sweeper, preservando o mesmo passo e a mesma chave idempotente até haver aceitação conhecida. Tratar supressão deliberada de forma explícita, sem confundi-la com mensagem enviada. Acrescentar teste no limite do adaptador com resultados `failed`, `deferred`, `sent` e `already-sent`, verificando que apenas a conclusão adequada avança o contador.

## Triage

- Decision: `VALID`
- Notes: Callback inspeciona `DispatchResult`, lança em falha/deferred e retorna supressão explícita; sweeper interrompe a pendência suprimida sem incrementar enviados/tentativas. Integração com dispatcher controlado e persistência PostgreSQL verificou os três casos, inclusive ausência de `lastSentAt` e preservação do contador. Execução independente: 13/09/2026 11:43:15 America/Sao_Paulo, 14 testes aprovados, exit 0. Regressão compartilhada preserva o comportamento dos callbacks existentes e cobre supressão.
