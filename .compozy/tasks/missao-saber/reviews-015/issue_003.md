---
status: resolved
file: apps/missao-saber/src/features/learning/components/player.tsx
line: 403
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: Exibir os passos escolhidos no histórico de ordenação

## Review Comment

Na conclusão da missão, «Sua resposta» interpola saved.chosen diretamente. Para ordenação, essa string é o JSON de IDs internos, por exemplo ["divide","part","multiply","result"]. A criança não consegue reler a sequência que organizou em português.

Formatar a resposta com os rótulos dos passos do snapshot, preservando a ordem efetivamente enviada; manter «Ainda não sei» para a desistência. Foi adicionada uma função de apresentação que não altera a resposta persistida, com teste do texto completo e asserção na jornada E2E.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
