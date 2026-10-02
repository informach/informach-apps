---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 602
severity: high
author: claude-code
provider_ref:
---

# Issue 005: Retirar evidências invalidadas de todos os agregados

## Review Comment

A filtragem por item/hash invalidado existia no histórico pedagógico, mas familyChallenge e previousAssessment somavam tentativas sem essa política. Depois de invalidar uma questão, o histórico retirava a evidência enquanto o desafio continuava em 1 e a comparação da avaliação continuava 2/2, em vez de 0 e 1/1 respectivamente.

Compartilhar a política de validade por versão exata entre essas leituras. As três superfícies agora excluem somente a versão invalidada; a versão corrigida do mesmo item continua válida. Os testes usam manutenção real em PostgreSQL isolado e conferem os resultados antes/depois.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
