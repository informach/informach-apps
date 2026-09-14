---
status: resolved
file: apps/missao-saber/src/features/billing/service.ts
line: 146
severity: medium
author: claude-code
provider_ref:
---

# Issue 001: Permitir recuperar intenção cujo cancelamento remoto falhou

## Review Comment

O bloqueio introduzido em013/003 impede qualquer nova troca quando há `pendingProductId`, `pendingPriceId` ou `cancelAtPeriodEnd`. Entretanto, o agendamento persiste a intenção antes de chamar a Stripe. Se a chamada falha antes de o provedor aceitar o cancelamento, a assinatura fica com intenção local e `cancelAtPeriodEnd = null`. Nesse estado, a nova guarda impede repetir o agendamento; a ação `reactivate()` exige especificamente `current.cancelAtPeriodEnd`, e a tela só apresenta “Manter assinatura atual” quando esse campo está preenchido. O responsável perde o caminho de recuperação.

Reprodução com `switchPlan()` real e armazenamento/provedor em memória: a primeira chamada falhou antes da aceitação remota e deixou `pending = true`, `cancelAtPeriodEnd = null`; a segunda foi rejeitada pela guarda antes de consultar a Stripe, mantendo apenas uma chamada ao provedor. A condição da ação do app também rejeita a reativação desse estado. O teste `keeps the durable target when scheduling at Stripe fails` comprova a persistência, mas não tenta recuperá-la depois.

Oferecer a ação de desfazer sempre que existir intenção pendente, mesmo sem confirmação local do cancelamento, e permitir que ela confirme o estado remoto antes de limpar a intenção. Alternativamente, implementar retomada idempotente do mesmo agendamento após consultar o provedor. Aplicar a guarda antes de qualquer alteração do perfil retido: atualmente `changePlan()` modifica essa escolha antes de o pacote recusar uma troca já agendada. Cobrir falha antes da aceitação, resposta perdida depois da aceitação, recuperação exibida e autorizada no app e nova troca após recuperação.

Esse é um efeito da guarda nova, distinto da substituição bem-sucedida de downgrade por upgrade descrita em013/003.

## Triage

- Decision: `RESOLVED`
- Notes: Revalidação independente confirmou retry exato, ação de manter assinatura mesmo sem cancelamento confirmado, interface de recuperação e guarda antes de alterar o perfil retido. O retry não reexecuta a seleção. Os16 testes de plan-changes passaram nesta revisão.

## Revalidação intermediária

O retry exato da intenção sem `cancelAtPeriodEnd`, a ação de manter assinatura e sua exposição na interface foram corrigidos. Permanece o ponto de ordem das mutações descrito acima: `changePlan()` ainda altera o perfil retido antes de `switchPlan()` rejeitar uma troca incompatível com o agendamento existente. Uma ação enviada por aba antiga pode falhar e, mesmo assim, substituir o perfil de um downgrade já válido. A guarda precisa preceder essa alteração local.

## Verificação final

O ponto restante foi corrigido: `changePlan()` valida intenção/cancelamento antes de `retainProfilesForSmallerPlan()`, e o retry exato preserva a escolha anterior. A tela oferece somente a repetição do alvo pendente ou “Manter assinatura atual” enquanto falta confirmação remota. A guarda equivalente no pacote continua rejeitando substituições incompatíveis. Sem pendência neste achado.
