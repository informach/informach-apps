---
status: resolved
file: apps/missao-saber/src/features/learning/engine.ts
line: 100
severity: medium
author: claude-code
provider_ref:
---

# Issue 002: Aceitar o símbolo monetário na posição usada no enunciado

## Review Comment

Em precos-3-7, o passe custa R$ 72 para 12 usos: a resposta é R$ 6 por uso. A unidade R$ é reconhecida apenas como sufixo; «6 R$» passa, mas «R$ 6,00» é rejeitado como entrada inválida, apesar de ser a notação usada pelo próprio enunciado.

Reconhecer o prefixo R$ quando a unidade declarada do item é real, mantendo aliases real/reais, ausência de unidade e sufixo compatíveis. Continuar recusando moeda diferente e expressões. O teste independente calcula 72/12, demonstra a rejeição anterior e cobre as seis notações e dois casos inválidos.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
