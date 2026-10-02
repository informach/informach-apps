---
status: resolved
file: apps/missao-saber/src/features/content/skills/argumentacao-em.ts
line: 503
severity: high
author: claude-code
provider_ref:
---

# Issue 011: Aceitar a validade da enumeração dos padrões de paridade

## Review Comment

`argumentacao-em-5-4` perguntava como provar que cinco inteiros têm duas entradas de mesma paridade. A alternativa «Listagem de todos os casos» era recusada com a justificativa de que existiriam infinitos quintetos. Os 32 padrões de paridade são uma enumeração finita e suficiente, portanto uma estratégia válida era marcada como errada.

O distrator agora propõe testar somente cinco quintetos e generalizar. Outra alternativa considera apenas extremos, também insuficiente. A explicação reconhece a enumeração completa como prova válida e mantém gavetas como a resposta disponível correta.

Verificação: `src/features/content/review16-content.test.ts`: enumera independentemente os 32 padrões, verifica a repetição de paridade e confronta as opções com suas interpretações matemáticas. A missão recebeu versão 2 e o hash revisado foi atualizado.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
