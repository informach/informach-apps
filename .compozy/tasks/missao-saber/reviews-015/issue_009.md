---
status: resolved
file: apps/missao-saber/src/features/content/skill-factory.ts
line: 148
severity: high
author: claude-code
provider_ref:
---

# Issue 009: Aceitar a troca de passos independentes na ordenação

## Review Comment

A fábrica impunha ordem exata em todos os itens, inclusive onde duas etapas são independentes. Em orcamento-3-9, listar despesas antes das entradas é igualmente válido; em caminhos-3-9, contar caminhos B→C antes de A→B também é válido. A correção marcava essas sequências como erradas.

A autoria agora pode declarar dependências entre pares de passos. Oito itens passaram a usar precedência: porcentagem, precos, orcamento, medidas, gavetas, caminhos, composicao-de-figuras e medir-e-comparar, todos na missão 3, item 9. A revisão testou todas as 24 permutações de cada item (192 casos) contra conjuntos independentes de ordens válidas. Os demais itens continuam com sua ordem autoral. Dicas deixam claro quando a sequência mostrada é uma possibilidade.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
