---
status: resolved
file: apps/missao-saber/scripts/stripe-provider-test.mjs
line: 224
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Homologar downgrade e cancelamento até o estado final

## Review Comment

Este é um déficit de evidência do provedor, não uma demonstração de que a implementação falha. O harness real agenda o downgrade, verifica apenas `pending_product_id`/`cancel_at_period_end` e o desfaz imediatamente. O resultado registrado confirma `scheduledDowngrade: "verified_and_reactivated"` e `cancellation: "scheduled_then_reactivated"`. Ele nunca deixa o downgrade chegar ao novo plano, não confirma qual perfil permanece ativo e não conclui um cancelamento para verificar perda de acesso com histórico/exportação preservados. Checkout abandonado também continua coberto somente por provedor falso.

Completar a homologação em test mode, de preferência com assinaturas ou relógios separados: efetivar Família → Individual e conferir o perfil escolhido; cancelar até `canceled` e provar a revogação; expirar um checkout real; consultar o banco e a interface depois de cada evento. Guardar no relatório `evidencias/fase-04.md` a saída redigida, IDs de execução não sensíveis, comandos e limpeza do relógio, cliente e banco descartável.

## Triage

- Decision: `RESOLVED`
- Notes: O harness real da Stripe concluiu checkout expirado, compra Família, três perfis, Portal, troca imediata, downgrade efetivo para Individual com perfil retido, renovação, falha, cancelamento e exportação do histórico. Relógios e banco foram removidos.

