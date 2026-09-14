---
status: resolved
file: packages/emails/src/dispatch.ts
line: 401
severity: medium
author: claude-code
provider_ref:
---

# Issue 002: Preservar estado do webhook ao finalizar envio ou retry

## Review Comment

O coletor passou a diferenciar `processed` de `delivered` e protege falhas terminais contra eventos de entrega tardios. Porém `dispatchEmail()` e `retryFailedDeliveries()` ainda gravam `status = sent` sem condicionar o estado atual depois de aguardar `deps.send()`. Um webhook pode ser processado enquanto a resposta do envio está em trânsito ou a persistência local aguarda o banco. Quando o dispatcher retoma, ele sobrescreve `delivered`, `bounced`, `dropped` ou `complained` com `sent` e limpa o erro. O tratamento de falha também grava `failed` incondicionalmente.

Reprodução sem I/O externo, usando as funções reais `dispatchEmail()` e `handleSendgridEvent()`: o callback do provedor aguardou o processamento de `delivered` antes de retornar o ID. Os estados observados foram `sending → delivered → sent`, comprovando a perda da confirmação final. Os mesmos writes incondicionais estão em `packages/emails/src/sweepers.ts:335–347,374–386`.

Tornar todas as atualizações de conclusão de envio monotônicas perante o estado confirmado pelo webhook. Persistir ID/aceitação/metadados sem rebaixar entrega ou falha terminal; uma falha tardia do transporte também não pode reabrir para retry uma mensagem cuja aceitação já foi confirmada. Cobrir envio inicial e sweeper com evento entregue/falha antes da resolução ou rejeição do provedor. Como o ledger é compartilhado, executar as regressões de e-mail e dos apps consumidores.

Esse achado é distinto de013/005: o ramo `processed` está corrigido; a regressão agora vem do dispatcher/sweeper após o coletor.

## Triage

- Decision: `RESOLVED`
- Notes: Revalidação independente confirmou monotonicidade das conclusões de envio, respeito à aceitação no loop inline, candidatos/claim do sweeper e replay direto. O dispatcher trata falhas terminais antes da aceitação e não reenvia failed/accepted; seu claim exige providerAccepted=false. Dispatch15/15 passou na execução final do revisor.

## Revalidação intermediária

Os writes de sucesso passaram a usar CASE preservando status, e o write de falha exige `status = sending`. Isso fecha a corrida delivered→resposta e bounced→falha tardia coberta pelos testes novos. Contudo, `processed` mantém o status sending e registra `providerAccepted = true`; a falha tardia ainda o transforma em failed. O loop inline também não consulta a aceitação antes de reenviar. Reprodução com as funções reais, evento processed confirmado dentro do provedor e resposta503: `sendCalls = 3`, `providerAccepted = true`, `finalStatus = failed`. Os candidatos/claims do retry também precisam respeitar a aceitação confirmada. O teste de falha tardia atual usa `inlineRetryAttempts: 1` com bounced, e não cobre esse caso.

## Segunda revalidação

O loop inline, o tratamento do erro e o filtro/claim do sweeper passaram a respeitar `providerAccepted`. Resta o replay direto em `dispatchEmail()`: o caminho inicial considera apenas `status` e seu claim não exige `providerAccepted = false`. Uma entrega failed seguida de processed tardio continua failed/accepted; se o dunning chamar novamente a mesma chave, o dispatcher envia outra vez. Reprodução com a função real e linha existente failed/accepted: `sends = 1`, quando deveria ser zero. Incluir a aceitação na idempotência inicial e no claim fecha esse caminho.

## Verificação final

O replay direto agora retorna `already-sent` para aceitação confirmada, sem chamar o provedor; sua normalização para sent é condicionada a estados não terminais. O claim também exige aceitação falsa, fechando a corrida entre leitura e claim. Estados bounced/dropped/complained continuam preservados. O teste novo reproduz failed/accepted e exige zero chamadas; a suíte focada final passou15/15. Os testes PostgreSQL de processed+503, entrega antes da resposta e bounce antes da falha tardia foram lidos; o implementador informou47/47 aprovados. Sem pendência neste achado.
