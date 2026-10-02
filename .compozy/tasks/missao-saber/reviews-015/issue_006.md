---
status: resolved
file: apps/missao-saber/src/features/family/components/family-controls.tsx
line: 140
severity: high
author: claude-code
provider_ref:
---

# Issue 006: Continuar a consulta de confirmação de pagamento

## Review Comment

PaymentConfirmation programava uma consulta em quatro segundos. Depois de incrementar tentativas, as dependências do efeito [paid, esgotado, router] não mudavam enquanto paid e esgotado permanecessem falsos. O efeito não armava nova consulta e nunca chegava ao limite de 15; uma confirmação posterior do provedor deixava a tela indefinidamente aguardando.

Acompanhar o contador no efeito e testar o limite nele. O novo E2E cria conta apenas no banco descartável, abre a tela de retorno do pagamento e observa pelo menos duas atualizações RSC bem-sucedidas. Nenhuma cobrança ou requisição a provedor real é efetuada.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
